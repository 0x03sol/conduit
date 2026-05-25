// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {BatchRegistry} from "./BatchRegistry.sol";

/// @title BatchRouter
/// @notice Orchestrates atomic distribution for a registered batch. Pulls
///         funding USDC from the caller, pushes per-recipient amounts in the
///         target currency, and refunds any excess.
/// @dev    Week 1 v1 ships **single-corridor (USDC -> USDC)** only. Every
///         recipient's `outputCurrency` MUST equal `bytes32("USDC")`. The FX
///         adapter for BRLA / EURC / etc. is wired in Week 2 (Phase 2.2).
///
///         Atomicity is enforced by Solidity's transaction semantics: any
///         revert in the distribution loop unwinds all prior transfers and
///         registry status writes (audit C6/F6 CEI).
///
///         Re-entry into `execute(batchId)` is prevented by two layers:
///           1. The registry's `Status.Pending -> Funded -> Executing -> Settled`
///              guard (`solidity-defi-patterns` Pattern 5). A second call on the
///              same batch reverts with `InvalidBatchStatus`.
///           2. OZ `ReentrancyGuard` on `execute()` (defence in depth).
///
///         Excess funding is refunded to `msg.sender` (Q-005 in memory.md
///         deliberately defers CCTP-friendly refund routing to Week 3).
contract BatchRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────── Constants ─────────────────────────

    /// @notice Sentinel for the only currency supported in v1 Week 1.
    bytes32 internal constant USDC_TICKER = bytes32("USDC");

    /// @notice Slippage cap, in basis points (100% = 10_000 bps).
    uint16 internal constant MAX_SLIPPAGE_BPS = 10_000;

    // ───────────────────────── Immutables ─────────────────────────

    BatchRegistry public immutable registry;
    IERC20 public immutable usdc;

    // ───────────────────────── Events ─────────────────────────

    /// @notice Emitted once a batch is fully distributed and Settled.
    /// @param batchId          Registry-assigned bytes32 identifier.
    /// @param totalDistributed Sum of amounts pushed to recipients (in USDC base units).
    /// @param recipientCount   Number of recipients in the batch.
    event BatchSettled(bytes32 indexed batchId, uint256 totalDistributed, uint256 recipientCount);

    // ───────────────────────── Errors ─────────────────────────

    error ZeroAddress();
    error BatchNotFound();
    error InvalidBatchStatus(BatchRegistry.Status status);
    error InvalidSlippage();
    error InsufficientFunding(uint256 provided, uint256 required);
    error UnsupportedCurrency(bytes32 currency);

    // ───────────────────────── Constructor ─────────────────────────

    constructor(address _registry, address _usdc) {
        if (_registry == address(0) || _usdc == address(0)) revert ZeroAddress();
        registry = BatchRegistry(_registry);
        usdc = IERC20(_usdc);
    }

    // ───────────────────────── Core ─────────────────────────

    /// @notice Atomically distribute `fundedAmount` of USDC to all recipients
    ///         of `batchId`, refunding any excess to `msg.sender`.
    /// @param  batchId         The registry batch identifier.
    /// @param  fundedAmount    USDC the caller commits to the batch. Must be
    ///                         >= sum of recipient amounts. Caller must have
    ///                         pre-approved this contract for `fundedAmount`.
    /// @param  maxSlippageBps  FX slippage cap in basis points (0..10_000).
    ///                         Currently only validated; consumed by Week 2 FX leg.
    function execute(
        bytes32 batchId,
        uint256 fundedAmount,
        uint16 maxSlippageBps
    ) external nonReentrant {
        // ── Checks ──
        if (maxSlippageBps > MAX_SLIPPAGE_BPS) revert InvalidSlippage();

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        if (b.sender == address(0)) revert BatchNotFound();
        if (b.status != BatchRegistry.Status.Pending) revert InvalidBatchStatus(b.status);

        BatchRegistry.Recipient[] memory rs = registry.getRecipients(batchId);
        uint256 n = rs.length;

        // Validate every recipient targets USDC (Week 1 single corridor).
        for (uint256 i; i < n;) {
            if (rs[i].outputCurrency != USDC_TICKER) {
                revert UnsupportedCurrency(rs[i].outputCurrency);
            }
            unchecked {
                ++i;
            }
        }

        uint256 totalNeeded = b.totalAmountSum;
        if (fundedAmount < totalNeeded) revert InsufficientFunding(fundedAmount, totalNeeded);

        // ── Effects (advance state machine before any value movement) ──
        registry.markFunded(batchId);
        registry.markExecuting(batchId);

        // ── Interactions ──
        // Pull funding from caller. SafeERC20 handles weird-ERC20 cases.
        usdc.safeTransferFrom(msg.sender, address(this), fundedAmount);

        // Distribute. Any revert here unwinds everything (atomicity).
        for (uint256 i; i < n;) {
            usdc.safeTransfer(rs[i].wallet, rs[i].amount);
            unchecked {
                ++i;
            }
        }

        // Refund any excess to caller.
        unchecked {
            uint256 leftover = fundedAmount - totalNeeded;
            if (leftover > 0) {
                usdc.safeTransfer(msg.sender, leftover);
            }
        }

        // Final status write + event.
        registry.markSettled(batchId);
        emit BatchSettled(batchId, totalNeeded, n);
    }
}
