// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IFxEscrow} from "./interfaces/IFxEscrow.sol";

/// @title MockFxEscrow
/// @notice Minimal stand-in for Circle's FxEscrow used by tests AND by the
///         Phase 2.3.5 deployment on Arc testnet (D-008: Conduit cannot
///         access Circle StableFX directly, so a maker-controlled mock is the
///         best available path until Circle's exact ABI + EIP-712 domain are
///         confirmed against `0x867650F5...`).
///
/// @dev    Behavior:
///           - Pulls `q.amountIn` of `q.tokenIn` from `msg.sender` (the
///             FxEscrowAdapter).
///           - Pulls `q.amountOut` of `q.tokenOut` from `q.maker` (must
///             have pre-approved this contract).
///           - Forwards `tokenOut` to `msg.sender` (the adapter).
///           - Returns `q.amountOut`.
///
///         Signature checking is delegated to the adapter — this mock does
///         NOT re-verify makerSig (it accepts whatever bytes are passed).
///         The adapter's own EIP-712 verification is what we exercise here.
///
///         When Circle's real FxEscrow ABI is confirmed and Conduit pivots
///         to it on mainnet, this contract is deprecated. v1 is mock-only.
contract MockFxEscrow is IFxEscrow {
    using SafeERC20 for IERC20;

    error QuoteExpired();

    /// @inheritdoc IFxEscrow
    function fillQuote(Quote calldata q, bytes calldata /* makerSig */)
        external
        returns (uint256 amountOut)
    {
        if (block.timestamp >= q.expiry) revert QuoteExpired();
        // Atomic PvP. Both pulls are SafeERC20, so any blocklist / allowance
        // failure on either leg unwinds the whole call.
        IERC20(q.tokenIn).safeTransferFrom(msg.sender, q.maker, q.amountIn);
        IERC20(q.tokenOut).safeTransferFrom(q.maker, msg.sender, q.amountOut);
        amountOut = q.amountOut;
    }
}
