// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BatchRegistry
/// @notice Stores and gates the lifecycle of batch settlement instructions.
///         A batch is a list of recipients (`wallet`, `amount`, `outputCurrency`)
///         registered by a sender. The accompanying `BatchRouter` orchestrates
///         the actual atomic distribution; this contract only owns the data and
///         the status machine. Identifiers are content-addressable
///         `bytes32 = keccak256(sender, chainid, recipients, nonce)` so identical
///         inputs across senders or chains never collide.
///         (Decision D-007 in memory.md.)
/// @dev Audit checklist refs: T1 (SPDX), T6 (natspec), C6/F6 (CEI),
///      F9 (modifiers), E1/E5 (indexed events), C27 (SafeERC20).
contract BatchRegistry {
    using SafeERC20 for IERC20;

    // ───────────────────────── Types ─────────────────────────

    /// @notice Lifecycle of a batch.
    /// @dev `None` is the implicit default for unknown batch IDs and lets us
    ///      detect "batch not found" via `b.sender == address(0)`.
    enum Status {
        None,
        Pending,
        Funded,
        Executing,
        Settled,
        Reverted
    }

    /// @notice One payee in a batch.
    /// @param wallet         Destination address on Arc.
    /// @param amount         Amount in the target token's native units (e.g. 6 dec for BRLA).
    /// @param outputCurrency Token ticker as bytes32 (e.g. bytes32("BRLA")).
    struct Recipient {
        address wallet;
        uint256 amount;
        bytes32 outputCurrency;
    }

    /// @notice Header data for a batch. Recipients are stored in a separate map.
    struct Batch {
        address sender;
        uint256 totalAmountSum;
        Status status;
        uint64 createdAt;
    }

    // ───────────────────────── Storage ─────────────────────────

    /// @notice USDC token used to pay registration fees.
    IERC20 public immutable usdc;

    /// @notice Admin authorized to set router and fee.
    address public owner;

    /// @notice The BatchRouter authorized to drive status transitions. Set once.
    address public router;

    /// @notice USDC charged at `createBatch`. May be 0.
    uint256 public registrationFee;

    /// @notice Per-sender monotonic nonce mixed into batchId derivation.
    mapping(address => uint64) public batchNonce;

    /// @dev Per-batch header. Internal because `getBatch` returns a `Batch memory`
    ///      copy; auto-generated public getter would expose tuple ordering.
    mapping(bytes32 => Batch) internal _batches;

    /// @dev Per-batch recipient list.
    mapping(bytes32 => Recipient[]) internal _recipients;

    // ───────────────────────── Events ─────────────────────────

    event BatchCreated(
        bytes32 indexed batchId,
        address indexed sender,
        uint256 totalAmountSum,
        uint256 recipientCount
    );
    event RouterSet(address indexed router);
    event RegistrationFeeSet(uint256 oldFee, uint256 newFee);
    event StatusUpdated(bytes32 indexed batchId, Status oldStatus, Status newStatus);

    // ───────────────────────── Errors ─────────────────────────

    error NotOwner();
    error NotRouter();
    error RouterAlreadySet();
    error ZeroAddress();
    error EmptyRecipients();
    error ZeroRecipientWallet();
    error ZeroRecipientAmount();
    error BatchNotFound();
    error InvalidStatusTransition(Status from, Status to);

    // ───────────────────────── Modifiers ─────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRouter() {
        if (msg.sender != router) revert NotRouter();
        _;
    }

    // ───────────────────────── Constructor ─────────────────────────

    /// @param _usdc            USDC token (Arc native gas token).
    /// @param _registrationFee Initial USDC fee charged at `createBatch`.
    constructor(address _usdc, uint256 _registrationFee) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        registrationFee = _registrationFee;
        owner = msg.sender;
    }

    // ───────────────────────── Admin ─────────────────────────

    /// @notice Bind the router contract. Single-shot; cannot be changed after first set.
    /// @dev    Single-shot policy keeps blast radius small if the owner key
    ///         is compromised after deploy. To rotate, deploy a fresh registry.
    function setRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert ZeroAddress();
        if (router != address(0)) revert RouterAlreadySet();
        router = _router;
        emit RouterSet(_router);
    }

    /// @notice Update the USDC fee charged at registration. May be set to 0.
    function setRegistrationFee(uint256 newFee) external onlyOwner {
        uint256 old = registrationFee;
        registrationFee = newFee;
        emit RegistrationFeeSet(old, newFee);
    }

    // ───────────────────────── Core ─────────────────────────

    /// @notice Register a new batch. Pulls `registrationFee` USDC from `msg.sender`.
    /// @param  rs Non-empty list of recipients. Each recipient's wallet and amount
    ///            must be non-zero.
    /// @return batchId Content-addressable identifier:
    ///         `keccak256(abi.encode(sender, chainid, recipients, nonce))`.
    /// @dev    Follows checks-effects-interactions: validation → state → external call.
    function createBatch(Recipient[] calldata rs) external returns (bytes32 batchId) {
        // ── Checks ──
        uint256 n = rs.length;
        if (n == 0) revert EmptyRecipients();

        uint256 totalSum;
        for (uint256 i; i < n;) {
            if (rs[i].wallet == address(0)) revert ZeroRecipientWallet();
            if (rs[i].amount == 0) revert ZeroRecipientAmount();
            totalSum += rs[i].amount;
            unchecked {
                ++i;
            }
        }

        // ── Effects ──
        uint64 nonce = batchNonce[msg.sender]++;
        batchId = keccak256(abi.encode(msg.sender, block.chainid, rs, nonce));

        _batches[batchId] = Batch({
            sender: msg.sender,
            totalAmountSum: totalSum,
            status: Status.Pending,
            createdAt: uint64(block.timestamp)
        });

        Recipient[] storage stored = _recipients[batchId];
        for (uint256 i; i < n;) {
            stored.push(rs[i]);
            unchecked {
                ++i;
            }
        }

        // ── Interactions ──
        if (registrationFee > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), registrationFee);
        }

        emit BatchCreated(batchId, msg.sender, totalSum, n);
    }

    // ─────────────────── Router-only state machine ───────────────────

    /// @notice Mark a Pending batch as Funded. Called by the router once the
    ///         inbound USDC has been credited (e.g. via CCTPHookReceiver).
    function markFunded(bytes32 batchId) external onlyRouter {
        Batch storage b = _batches[batchId];
        if (b.sender == address(0)) revert BatchNotFound();
        if (b.status != Status.Pending) revert InvalidStatusTransition(b.status, Status.Funded);
        b.status = Status.Funded;
        emit StatusUpdated(batchId, Status.Pending, Status.Funded);
    }

    /// @notice Funded → Executing. Called immediately before the router begins
    ///         FX swaps and recipient transfers. Functions as a reentrancy
    ///         guard at the registry layer.
    function markExecuting(bytes32 batchId) external onlyRouter {
        Batch storage b = _batches[batchId];
        if (b.sender == address(0)) revert BatchNotFound();
        if (b.status != Status.Funded) revert InvalidStatusTransition(b.status, Status.Executing);
        b.status = Status.Executing;
        emit StatusUpdated(batchId, Status.Funded, Status.Executing);
    }

    /// @notice Executing → Settled. Terminal success.
    function markSettled(bytes32 batchId) external onlyRouter {
        Batch storage b = _batches[batchId];
        if (b.sender == address(0)) revert BatchNotFound();
        if (b.status != Status.Executing) revert InvalidStatusTransition(b.status, Status.Settled);
        b.status = Status.Settled;
        emit StatusUpdated(batchId, Status.Executing, Status.Settled);
    }

    /// @notice Mark a batch as Reverted from any non-terminal state.
    /// @dev    Useful when an off-chain leg (FX RFQ, CCTP attestation) fails
    ///         and we need to record final state without auto-distribution.
    function markReverted(bytes32 batchId) external onlyRouter {
        Batch storage b = _batches[batchId];
        if (b.sender == address(0)) revert BatchNotFound();
        if (b.status == Status.Settled || b.status == Status.Reverted) {
            revert InvalidStatusTransition(b.status, Status.Reverted);
        }
        Status oldStatus = b.status;
        b.status = Status.Reverted;
        emit StatusUpdated(batchId, oldStatus, Status.Reverted);
    }

    // ───────────────────────── Views ─────────────────────────

    function getBatch(bytes32 batchId) external view returns (Batch memory) {
        return _batches[batchId];
    }

    function getRecipients(bytes32 batchId) external view returns (Recipient[] memory) {
        return _recipients[batchId];
    }

    function recipientsLength(bytes32 batchId) external view returns (uint256) {
        return _recipients[batchId].length;
    }
}
