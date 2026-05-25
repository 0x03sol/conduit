// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IFXAdapter
/// @notice Common interface for Conduit's FX adapters. The BatchRouter calls
///         `swap` once per output-currency group during settlement; the
///         adapter pulls USDC from the caller, executes the conversion (mock
///         rate or real maker-signed quote via `FxEscrow`), and sends the
///         output token back to the caller.
///
///         Adapter implementations:
///           * `MockFxAdapter` — deterministic rate per token, used in unit
///                                tests and v1 testnet flows where no real
///                                maker is available.
///           * `FxEscrowAdapter` — production adapter; decodes a maker-signed
///                                 `Quote` from `extraData` and routes through
///                                 `FxEscrow.fillQuote`.
///
/// @dev The caller (BatchRouter) MUST have approved this adapter for at least
///      `amountIn` of USDC before calling `swap`. The adapter MUST NOT retain
///      USDC or `tokenOut` after `swap` returns.
interface IFXAdapter {
    /// @notice Swap `amountIn` USDC for `tokenOut`, sending the proceeds to
    ///         `msg.sender` (the BatchRouter).
    /// @param  amountIn      USDC base units to swap. Caller must have a
    ///                       sufficient allowance.
    /// @param  tokenOut      The output token (e.g. BRLA, EURC, JPYC).
    /// @param  minAmountOut  Application-level slippage floor in `tokenOut`
    ///                       base units. The adapter MUST revert if the
    ///                       executed price would deliver less than this.
    /// @param  extraData     Implementation-specific payload. Mocks ignore it;
    ///                       `FxEscrowAdapter` decodes `(IFxEscrow.Quote, bytes makerSig)`.
    /// @return amountOut     Amount of `tokenOut` actually delivered to caller.
    function swap(
        uint256 amountIn,
        address tokenOut,
        uint256 minAmountOut,
        bytes calldata extraData
    ) external returns (uint256 amountOut);
}
