// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IFXAdapter} from "./interfaces/IFXAdapter.sol";

/// @title MockFxAdapter
/// @notice Test / testnet FX adapter that returns a deterministic rate per
///         output token. Used in unit tests and v1 testnet flows where no
///         live maker is available (decision D-008 in memory.md).
/// @dev    The adapter pulls `amountIn` USDC from `msg.sender` (typically
///         the BatchRouter) and transfers `amountOut` of `tokenOut` from
///         its own pre-funded reserve back to the caller. Production swaps
///         would use `FxEscrowAdapter` instead.
///
///         Rate semantics:
///           ratePerUsdc[tokenOut] = (tokenOut base units) per (1 USDC base unit) × 1e6
///         Example: 1 USDC = 5.00 BRLA (BRLA has 18 decimals; USDC has 6)
///           1 USDC = 1e6 base units.
///           5 BRLA = 5e18 base units.
///           rate = (5e18 / 1e6) × 1e6 = 5e18.
///         So `amountOut = amountIn × rate / 1e6`.
///
/// @dev Audit refs: T1 (SPDX), T6 (natspec), C6 CEI, C27 SafeERC20.
contract MockFxAdapter is IFXAdapter {
    using SafeERC20 for IERC20;

    uint256 internal constant RATE_DENOM = 1e6;

    /// @notice USDC token address (Arc native gas token in production).
    IERC20 public immutable usdc;

    /// @notice Admin authorized to set rates. Set in constructor; non-rotatable
    ///         (this is a test fixture; production uses `FxEscrowAdapter`).
    address public owner;

    /// @notice Output-token base-units per 1 USDC base unit, scaled by 1e6.
    ///         A rate of 0 means the token is not supported.
    mapping(address => uint256) public ratePerUsdc;

    // ───────────────────────── Events ─────────────────────────

    event RateSet(address indexed tokenOut, uint256 rateScaled);
    event Swapped(address indexed caller, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    // ───────────────────────── Errors ─────────────────────────

    error ZeroAddress();
    error NotOwner();
    error SameToken();
    error ZeroAmount();
    error UnsupportedToken(address tokenOut);
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        owner = msg.sender;
    }

    /// @notice Set a deterministic rate for `tokenOut`. Pass 0 to disable.
    function setRate(address tokenOut, uint256 rateScaled) external onlyOwner {
        if (tokenOut == address(0)) revert ZeroAddress();
        if (tokenOut == address(usdc)) revert SameToken();
        ratePerUsdc[tokenOut] = rateScaled;
        emit RateSet(tokenOut, rateScaled);
    }

    /// @inheritdoc IFXAdapter
    function swap(
        uint256 amountIn,
        address tokenOut,
        uint256 minAmountOut,
        bytes calldata /* extraData — ignored by mock */
    ) external returns (uint256 amountOut) {
        // ── Checks ──
        if (amountIn == 0) revert ZeroAmount();
        uint256 rate = ratePerUsdc[tokenOut];
        if (rate == 0) revert UnsupportedToken(tokenOut);

        amountOut = (amountIn * rate) / RATE_DENOM;
        if (amountOut < minAmountOut) revert SlippageExceeded(amountOut, minAmountOut);

        // ── Effects / Interactions ──
        // Pull USDC from caller. Reverts if allowance / balance insufficient.
        usdc.safeTransferFrom(msg.sender, address(this), amountIn);

        // Deliver tokenOut from adapter's pre-funded reserve.
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swapped(msg.sender, tokenOut, amountIn, amountOut);
    }
}
