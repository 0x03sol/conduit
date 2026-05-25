// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BatchRouter} from "./BatchRouter.sol";
import {IMessageHandlerV2} from "./interfaces/IMessageHandlerV2.sol";

/// @title CCTPHookReceiver
/// @notice Cross-chain entry point for Conduit batches. CCTP V2's
///         `MessageTransmitterV2.receiveMessage` mints the burned USDC to
///         this contract first, then calls one of the two methods below.
///         The hook decodes the batch reference, approves the `BatchRouter`
///         for the freshly-minted USDC, and triggers atomic distribution.
///
///         hookData layout:
///           abi.encode(bytes32 batchId, uint16 maxFxSlippageBps, bytes extraData)
///         where `extraData` is the FX-leg payload passed through to the
///         configured `IFXAdapter` (empty `0x` for the USDC corridor and
///         for `MockFxAdapter`).
///
/// @dev    Security:
///           1. `msg.sender == messageTransmitter` (gate).
///           2. `trustedRemoteSenders[srcDomain] == sender` allowlist.
///              Both checks together prevent any spoofed CCTP message from
///              being processed (audit C7, F9).
///           3. Funded amount = `usdc.balanceOf(this)` at hook time. The
///              receiver MUST be empty between settlements; any residual
///              from a previous USDC-corridor refund stays here until the
///              owner sweeps. The `sweep()` admin function drains it.
///           4. `forceApprove(router, x)` then reset to 0 around
///              `router.execute` (audit C27 weird-ERC20 defence).
///           5. `nonReentrant` on the hook entry — defence-in-depth on top
///              of CCTP's per-nonce dedup.
///
/// @dev    Q-005 (memory.md) is still open: refund destination for the
///         USDC corridor's excess. Today the excess accumulates here and
///         the owner sweeps it. A follow-up could refund-back-via-CCTP,
///         pay-out-to-batch-sender, etc.
contract CCTPHookReceiver is IMessageHandlerV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────── Immutables ─────────────────────────

    address public immutable messageTransmitter;
    IERC20 public immutable usdc;
    BatchRouter public immutable router;
    address public owner;

    // ───────────────────────── Storage ─────────────────────────

    /// @notice Per-source-domain trusted sender allowlist. Sender is
    ///         expected to be the source-chain `TokenMessengerV2` or our
    ///         own contract; in either case its bytes32-padded address.
    mapping(uint32 => bytes32) public trustedRemoteSenders;

    // ───────────────────────── Events ─────────────────────────

    event TrustedRemoteSenderSet(uint32 indexed srcDomain, bytes32 indexed sender);
    event Swept(address indexed token, address indexed to, uint256 amount);
    event MessageHandled(
        uint32 indexed sourceDomain,
        bytes32 indexed sender,
        bytes32 indexed batchId,
        uint256 fundedAmount
    );
    event HookProcessed(bytes32 indexed batchId, uint256 fundedAmount);

    // ───────────────────────── Errors ─────────────────────────

    error ZeroAddress();
    error NotOwner();
    error NotMessageTransmitter();
    error UntrustedRemoteSender(uint32 srcDomain, bytes32 sender);
    error NoFunding();
    error MalformedBurnMessage();
    error MalformedCCTPMessage();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ───────────────────────── Constructor ─────────────────────────

    constructor(address _messageTransmitter, address _usdc, address _router) {
        if (_messageTransmitter == address(0) || _usdc == address(0) || _router == address(0)) {
            revert ZeroAddress();
        }
        messageTransmitter = _messageTransmitter;
        usdc = IERC20(_usdc);
        router = BatchRouter(_router);
        owner = msg.sender;
    }

    // ───────────────────────── Admin ─────────────────────────

    /// @notice Allowlist a remote (source domain, sender) pair. Pass
    ///         `bytes32(0)` for `sender` to revoke a previously-set entry.
    function setTrustedRemoteSender(uint32 srcDomain, bytes32 sender) external onlyOwner {
        trustedRemoteSenders[srcDomain] = sender;
        emit TrustedRemoteSenderSet(srcDomain, sender);
    }

    /// @notice Sweep residual tokens (typically USDC refund from the USDC
    ///         corridor) to a designated address.
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit Swept(token, to, amount);
    }

    // ───────────────────────── IMessageHandlerV2 ─────────────────────────

    /// @inheritdoc IMessageHandlerV2
    function handleReceiveFinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        uint32 /* finalityThresholdExecuted */,
        bytes calldata messageBody
    ) external nonReentrant returns (bool) {
        return _handle(sourceDomain, sender, messageBody);
    }

    /// @inheritdoc IMessageHandlerV2
    function handleReceiveUnfinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        uint32 /* finalityThresholdExecuted */,
        bytes calldata messageBody
    ) external nonReentrant returns (bool) {
        return _handle(sourceDomain, sender, messageBody);
    }

    // ─────────────────────── Manual hook trigger ─────────────────────────
    //
    // NOTE on CCTP V2 hook execution:
    //
    //   For TOKEN BURN messages (TokenMessengerV2.depositForBurnWithHook),
    //   the destination MessageTransmitterV2 routes the message to
    //   TokenMessengerV2 (registered as the handler), which mints USDC to
    //   `mintRecipient` (= this contract) but does NOT execute the embedded
    //   hookData. CCTP V2's design intentionally keeps hook execution out
    //   of the core protocol (verified against Circle's reference contract
    //   2026-05-25; see TokenMessengerV2._handleReceiveMessage).
    //
    //   Therefore, after `receiveMessage` lands USDC here, the integrator
    //   (typically the relayer) calls `processHook(hookData)` to dispatch
    //   the batch. The IMessageHandlerV2 methods above remain valid for
    //   arbitrary `sendMessage` flows (no token), where CCTP DOES auto-call
    //   the recipient.
    //
    //   Open security note: `processHook` is callable by anyone. The threat
    //   is that an attacker registers a batch where they are the recipient
    //   and then races to call `processHook` with that batchId after a
    //   legitimate CCTP mint lands. Mitigation in v1: keep the receiver
    //   single-tenant (one batch in flight at a time) and `sweep()` any
    //   residual after settlement. v2 may bind a batch to a specific
    //   (sourceDomain, messageSender) pair so only the legitimate burner
    //   can trigger.

    /// @notice Dispatch a previously-minted batch using the supplied hookData.
    /// @dev    Use this AFTER `MessageTransmitterV2.receiveMessage` has
    ///         minted USDC to this contract. The relayer (or any caller)
    ///         passes the hookData payload that was embedded in the
    ///         BurnMessageV2.
    function processHook(bytes calldata hookData) external nonReentrant returns (bool) {
        return _dispatch(hookData);
    }

    /// @notice Convenience: takes the raw BurnMessageV2 bytes (the messageBody
    ///         passed to `IMessageHandlerV2.handleReceiveMessage`), extracts
    ///         the hookData portion, and dispatches.
    /// @dev    BurnMessageV2 layout (verified against Circle docs 2026-05-25):
    ///           offset 0   uint32   version
    ///           offset 4   bytes32  burnToken
    ///           offset 36  bytes32  mintRecipient
    ///           offset 68  uint256  amount
    ///           offset 100 bytes32  messageSender
    ///           offset 132 uint256  maxFee
    ///           offset 164 uint256  feeExecuted
    ///           offset 196 uint256  expirationBlock
    ///           offset 228 bytes    hookData (dynamic)
    ///         Use this when the caller has the inner BurnMessageV2 only
    ///         (e.g. via `IMessageHandlerV2`'s `messageBody` parameter).
    function processBurnMessage(bytes calldata burnMessage) external nonReentrant returns (bool) {
        if (burnMessage.length < 228) revert MalformedBurnMessage();
        return _dispatch(burnMessage[228:]);
    }

    /// @notice Convenience: takes the FULL CCTP V2 message (as returned by
    ///         Iris in the `message` field), strips both the CCTP V2 header
    ///         (148 bytes) AND the BurnMessageV2 header (228 bytes), then
    ///         dispatches the hookData.
    /// @dev    CCTP V2 message layout = 148-byte header + messageBody.
    ///         For token burns, messageBody = BurnMessageV2 (228 + hookData).
    ///         So the hookData starts at offset 148 + 228 = 376.
    ///         Use this when the relayer has the raw `message` from Iris and
    ///         wants a one-call dispatch.
    function processCCTPMessage(bytes calldata cctpMessage) external nonReentrant returns (bool) {
        if (cctpMessage.length < 376) revert MalformedCCTPMessage();
        return _dispatch(cctpMessage[376:]);
    }

    // ───────────────────────── Internal ─────────────────────────

    function _dispatch(bytes calldata hookData) internal returns (bool) {
        (bytes32 batchId, uint16 maxFxSlippageBps, bytes memory extraData) =
            abi.decode(hookData, (bytes32, uint16, bytes));

        uint256 fundedAmount = usdc.balanceOf(address(this));
        if (fundedAmount == 0) revert NoFunding();

        usdc.forceApprove(address(router), fundedAmount);
        router.execute(batchId, fundedAmount, maxFxSlippageBps, extraData);
        usdc.forceApprove(address(router), 0);

        emit HookProcessed(batchId, fundedAmount);
        return true;
    }

    function _handle(uint32 sourceDomain, bytes32 sender, bytes calldata messageBody)
        internal
        returns (bool)
    {
        // ── Auth ──
        if (msg.sender != messageTransmitter) revert NotMessageTransmitter();
        bytes32 expected = trustedRemoteSenders[sourceDomain];
        if (expected == bytes32(0) || expected != sender) {
            revert UntrustedRemoteSender(sourceDomain, sender);
        }

        // ── Decode ──
        // Reverts (panic 0x12 / 0x32) on malformed input; that's acceptable.
        (bytes32 batchId, uint16 maxFxSlippageBps, bytes memory extraData) =
            abi.decode(messageBody, (bytes32, uint16, bytes));

        // ── Funding source: whatever USDC is on this contract right now. ──
        uint256 fundedAmount = usdc.balanceOf(address(this));
        if (fundedAmount == 0) revert NoFunding();

        // ── Hand off to the router. CEI: state isn't mutated locally. ──
        usdc.forceApprove(address(router), fundedAmount);
        router.execute(batchId, fundedAmount, maxFxSlippageBps, extraData);
        usdc.forceApprove(address(router), 0);

        emit MessageHandled(sourceDomain, sender, batchId, fundedAmount);
        return true;
    }
}
