// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IFxEscrow
/// @notice Subset of Circle's `FxEscrow` interface that Conduit uses.
///         Real address on Arc testnet (verified 2026-05-25):
///         `0x867650F5eAe8df91445971f14d89fd84F0C9a9f8`.
///
/// @dev    The full Circle interface is broader (admin, maker registry, etc.).
///         We intentionally bind to only what `FxEscrowAdapter` needs to call.
///         Update against the live ABI before mainnet.
interface IFxEscrow {
    /// @notice Maker-signed RFQ quote consumed by `fillQuote`.
    /// @dev EIP-712 type hash:
    ///   keccak256("Quote(address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address maker,address taker,uint256 expiry,uint256 nonce)")
    struct Quote {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOut;
        address maker;
        address taker;
        uint256 expiry;
        uint256 nonce;
    }

    /// @notice Atomically swaps `quote.amountIn` of `quote.tokenIn` from
    ///         `quote.taker` for `quote.amountOut` of `quote.tokenOut` from
    ///         `quote.maker`. Caller (taker) must have approved this contract
    ///         for at least `quote.amountIn`. Maker must have approved this
    ///         contract for at least `quote.amountOut`.
    /// @return amountOut The amount of `quote.tokenOut` delivered to the taker.
    function fillQuote(Quote calldata quote, bytes calldata makerSig)
        external
        returns (uint256 amountOut);
}
