// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BatchRegistry} from "./BatchRegistry.sol";
import {IFXAdapter} from "./interfaces/IFXAdapter.sol";

/// @title BatchRouter
/// @notice Orchestrates atomic distribution for a registered batch.
/// @dev    Per D-001 (memory.md), v1 supports a SINGLE FX corridor per router
///         instance, hardcoded at constructor time. Two execution paths:
///
///         (1) **USDC corridor** — every recipient has
///             `outputCurrency == bytes32("USDC")`. Router pulls funding,
///             distributes USDC directly, refunds excess to caller. Same as
///             Phase 1 behavior.
///
///         (2) **FX corridor** — every recipient has
///             `outputCurrency == fxTicker` (set at construction). Router
///             pulls funding USDC, calls `fxAdapter.swap(fundedAmount,
///             address(fxToken), totalNeeded, fxExtraData)`, asserts the
///             received amount equals `totalNeeded` exactly, then distributes
///             `fxToken` to recipients. The caller MUST size `fundedAmount`
///             so the swap output matches `totalNeeded`.
///
///         Mixed corridors (some recipients USDC + some FX in the same batch)
///         revert with `MixedCorridorNotSupported`. Multi-currency batches
///         are deferred to v2.
///
///         Setting `fxTicker = bytes32(0)` at construction disables the FX
///         path (Phase 1 deploys used this).
///
///         Reentrancy: two layers — OZ `ReentrancyGuard` on `execute` plus
///         the registry's `Pending → Funded → Executing → Settled` status
///         guard (`solidity-defi-patterns` Pattern 5).
contract BatchRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────── Constants ─────────────────────────

    bytes32 internal constant USDC_TICKER = bytes32("USDC");
    uint16 internal constant MAX_SLIPPAGE_BPS = 10_000;

    // ───────────────────────── Immutables ─────────────────────────

    BatchRegistry public immutable registry;
    IERC20 public immutable usdc;

    /// @notice The single FX corridor served by this router. `bytes32(0)` means
    ///         FX is disabled and only the USDC corridor is supported.
    bytes32 public immutable fxTicker;
    /// @notice ERC-20 corresponding to `fxTicker`. `address(0)` iff FX disabled.
    IERC20 public immutable fxToken;
    /// @notice Swap engine used for the FX leg. `address(0)` iff FX disabled.
    IFXAdapter public immutable fxAdapter;

    // ───────────────────────── Events ─────────────────────────

    event BatchSettled(bytes32 indexed batchId, uint256 totalDistributed, uint256 recipientCount);

    // ───────────────────────── Errors ─────────────────────────

    error ZeroAddress();
    error InvalidCorridorConfig();
    error BatchNotFound();
    error InvalidBatchStatus(BatchRegistry.Status status);
    error InvalidSlippage();
    error InsufficientFunding(uint256 provided, uint256 required);
    error UnsupportedCurrency(bytes32 currency);
    error MixedCorridorNotSupported();
    error FXAmountMismatch(uint256 received, uint256 needed);

    // ───────────────────────── Constructor ─────────────────────────

    /// @param _registry  BatchRegistry to read from + state-machine into.
    /// @param _usdc      USDC (Arc native gas token in production).
    /// @param _fxTicker  Currency ticker for the FX corridor (e.g. `bytes32("BRLA")`).
    ///                   Pass `bytes32(0)` to disable FX entirely.
    /// @param _fxToken   ERC-20 corresponding to `_fxTicker`. Required iff FX enabled.
    /// @param _fxAdapter IFXAdapter implementation. Required iff FX enabled.
    constructor(
        address _registry,
        address _usdc,
        bytes32 _fxTicker,
        address _fxToken,
        address _fxAdapter
    ) {
        if (_registry == address(0) || _usdc == address(0)) revert ZeroAddress();

        if (_fxTicker == USDC_TICKER) revert InvalidCorridorConfig();

        if (_fxTicker != bytes32(0)) {
            // FX enabled: must supply both token and adapter.
            if (_fxToken == address(0) || _fxAdapter == address(0)) {
                revert InvalidCorridorConfig();
            }
        } else {
            // FX disabled: must NOT supply token or adapter.
            if (_fxToken != address(0) || _fxAdapter != address(0)) {
                revert InvalidCorridorConfig();
            }
        }

        registry = BatchRegistry(_registry);
        usdc = IERC20(_usdc);
        fxTicker = _fxTicker;
        fxToken = IERC20(_fxToken);
        fxAdapter = IFXAdapter(_fxAdapter);
    }

    // ───────────────────────── Core ─────────────────────────

    /// @notice Atomically distribute a batch.
    /// @param batchId         Registry batch ID.
    /// @param fundedAmount    USDC the caller commits. Caller must have
    ///                        pre-approved this contract.
    /// @param maxSlippageBps  Slippage cap in bps (0..10_000). Currently
    ///                        validated only; reserved for future use.
    /// @param fxExtraData     Adapter-specific payload for the FX leg
    ///                        (encoded `(IFxEscrow.Quote, makerSig)` for
    ///                        `FxEscrowAdapter`; ignored by `MockFxAdapter`).
    ///                        MUST be empty for USDC corridor.
    function execute(
        bytes32 batchId,
        uint256 fundedAmount,
        uint16 maxSlippageBps,
        bytes calldata fxExtraData
    ) external nonReentrant {
        // ── Checks ──
        if (maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        if (b.sender == address(0)) revert BatchNotFound();
        if (b.status != BatchRegistry.Status.Pending) revert InvalidBatchStatus(b.status);

        BatchRegistry.Recipient[] memory rs = registry.getRecipients(batchId);
        uint256 n = rs.length;

        // Determine corridor. Single-currency-per-batch invariant.
        bytes32 ticker = rs[0].outputCurrency;
        for (uint256 i = 1; i < n;) {
            if (rs[i].outputCurrency != ticker) revert MixedCorridorNotSupported();
            unchecked {
                ++i;
            }
        }

        bool isFX;
        if (ticker == USDC_TICKER) {
            isFX = false;
        } else if (ticker == fxTicker && address(fxAdapter) != address(0)) {
            isFX = true;
        } else {
            revert UnsupportedCurrency(ticker);
        }

        uint256 totalNeeded = b.totalAmountSum;

        // For the USDC path, fundedAmount and totalNeeded are in the same units.
        // For the FX path they are not (USDC vs fxToken), so the comparison is
        // moved to the post-swap invariant inside the FX block.
        if (!isFX && fundedAmount < totalNeeded) {
            revert InsufficientFunding(fundedAmount, totalNeeded);
        }

        // ── Effects ──
        registry.markFunded(batchId);
        registry.markExecuting(batchId);

        // ── Interactions ──
        usdc.safeTransferFrom(msg.sender, address(this), fundedAmount);

        if (isFX) {
            // Swap USDC -> fxToken via the adapter.
            usdc.forceApprove(address(fxAdapter), fundedAmount);
            uint256 received = fxAdapter.swap(
                fundedAmount,
                address(fxToken),
                totalNeeded,
                fxExtraData
            );
            usdc.forceApprove(address(fxAdapter), 0);

            // Tight invariant for v1: caller MUST size the quote so received
            // matches the recipients' total exactly. Over- or under-delivery
            // is a misconfigured batch.
            if (received != totalNeeded) revert FXAmountMismatch(received, totalNeeded);

            for (uint256 i; i < n;) {
                fxToken.safeTransfer(rs[i].wallet, rs[i].amount);
                unchecked {
                    ++i;
                }
            }
            // No USDC excess refund: all `fundedAmount` went into the swap.
        } else {
            // USDC corridor (Phase 1 behavior, unchanged).
            for (uint256 i; i < n;) {
                usdc.safeTransfer(rs[i].wallet, rs[i].amount);
                unchecked {
                    ++i;
                }
            }
            unchecked {
                uint256 leftover = fundedAmount - totalNeeded;
                if (leftover > 0) {
                    usdc.safeTransfer(msg.sender, leftover);
                }
            }
        }

        registry.markSettled(batchId);
        emit BatchSettled(batchId, totalNeeded, n);
    }
}
