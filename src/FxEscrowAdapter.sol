// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IFXAdapter} from "./interfaces/IFXAdapter.sol";
import {IFxEscrow} from "./interfaces/IFxEscrow.sol";

/// @title FxEscrowAdapter
/// @notice Production FX adapter that bridges Conduit's `BatchRouter` to
///         Circle's `FxEscrow` (`0x867650F5eAe8df91445971f14d89fd84F0C9a9f8`
///         on Arc testnet). Decodes a maker-signed `Quote` from `extraData`,
///         validates it against the requested swap, then delegates the
///         atomic PvP transfer to `FxEscrow.fillQuote`.
///
/// @dev    Per memory.md D-008, v1 uses **locally-signed maker quotes**: the
///         test wallet acts as both taker and maker. A real on-chain run with
///         a third-party maker would set them up via `setMakerAllowed`.
///
///         The adapter pulls USDC from `msg.sender` (the BatchRouter), uses
///         a single forceApprove → fillQuote → forceApprove(0) sequence to
///         interact with the escrow, then forwards the received `tokenOut`
///         back to the caller. No retention of either side after `swap`.
///
///         Replay protection: maker nonces are tracked per-maker in
///         `usedNonces[maker][nonce]` so a leaked sig cannot be re-fired.
///
/// @dev Audit refs: T1 SPDX, T6 natspec, C6/F6 CEI, C10/C11/C12 EIP-712 with
///      chainid + verifyingContract, C27 SafeERC20, audit pattern §3 + §6
///      replay safety.
contract FxEscrowAdapter is IFXAdapter {
    using SafeERC20 for IERC20;

    // ───────────────────────── EIP-712 ─────────────────────────

    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address maker,address taker,uint256 expiry,uint256 nonce)"
    );

    // ───────────────────────── Immutables ─────────────────────────

    IERC20 public immutable usdc;
    IFxEscrow public immutable escrow;
    address public immutable owner;

    // ───────────────────────── Storage ─────────────────────────

    /// @notice Whitelist of maker addresses we accept signatures from.
    mapping(address => bool) public allowedMaker;

    /// @notice Per-maker, per-nonce replay guard.
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    // ───────────────────────── Events ─────────────────────────

    event MakerAllowedSet(address indexed maker, bool allowed);
    event Swapped(
        address indexed caller,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address maker,
        uint256 nonce
    );

    // ───────────────────────── Errors ─────────────────────────

    error ZeroAddress();
    error NotOwner();
    error ZeroAmount();
    error TokenInMismatch();
    error TokenOutMismatch();
    error AmountInMismatch();
    error QuoteExpired();
    error WrongTaker();
    error UnknownMaker(address maker);
    error InvalidSigner();
    error QuoteAlreadyUsed();
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ───────────────────────── Constructor ─────────────────────────

    constructor(address _usdc, address _escrow) {
        if (_usdc == address(0) || _escrow == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        escrow = IFxEscrow(_escrow);
        owner = msg.sender;
    }

    // ───────────────────────── Admin ─────────────────────────

    function setMakerAllowed(address maker, bool allowed) external onlyOwner {
        allowedMaker[maker] = allowed;
        emit MakerAllowedSet(maker, allowed);
    }

    // ───────────────────────── Core (IFXAdapter) ─────────────────────────

    /// @inheritdoc IFXAdapter
    function swap(
        uint256 amountIn,
        address tokenOut,
        uint256 minAmountOut,
        bytes calldata extraData
    ) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();

        // Decode the maker-signed quote.
        (IFxEscrow.Quote memory q, bytes memory makerSig) = abi.decode(extraData, (IFxEscrow.Quote, bytes));

        // ─── Quote validation ───
        if (q.tokenIn != address(usdc)) revert TokenInMismatch();
        if (q.tokenOut != tokenOut) revert TokenOutMismatch();
        if (q.amountIn != amountIn) revert AmountInMismatch();
        if (block.timestamp >= q.expiry) revert QuoteExpired();
        if (q.taker != address(this)) revert WrongTaker();
        if (q.amountOut < minAmountOut) revert SlippageExceeded(q.amountOut, minAmountOut);
        if (!allowedMaker[q.maker]) revert UnknownMaker(q.maker);
        if (usedNonces[q.maker][q.nonce]) revert QuoteAlreadyUsed();

        // EIP-712 signature check binds the quote to (chainid, this contract, maker).
        _verifyMakerSignature(q, makerSig);

        // ─── Effects ───
        usedNonces[q.maker][q.nonce] = true;

        // ─── Interactions ───
        // 1. Pull USDC from caller (BatchRouter).
        usdc.safeTransferFrom(msg.sender, address(this), amountIn);

        // 2. Approve escrow for the inbound token (escrow may pull via standard
        //    transferFrom or Permit2 internally; forceApprove handles weird
        //    ERC-20 race conditions defensively).
        usdc.forceApprove(address(escrow), amountIn);

        // 3. Atomic PvP fill.
        amountOut = escrow.fillQuote(q, makerSig);

        // 4. Belt-and-braces: clear residual approval + post-fill slippage check.
        usdc.forceApprove(address(escrow), 0);
        if (amountOut < minAmountOut) revert SlippageExceeded(amountOut, minAmountOut);

        // 5. Forward output to caller.
        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);

        emit Swapped(msg.sender, tokenOut, amountIn, amountOut, q.maker, q.nonce);
    }

    // ───────────────────────── EIP-712 helpers ─────────────────────────

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Conduit-FxEscrowAdapter")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _hashQuote(IFxEscrow.Quote memory q) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.tokenIn,
                q.tokenOut,
                q.amountIn,
                q.amountOut,
                q.maker,
                q.taker,
                q.expiry,
                q.nonce
            )
        );
    }

    function _verifyMakerSignature(IFxEscrow.Quote memory q, bytes memory sig) internal view {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _hashQuote(q)));
        address signer = ECDSA.recover(digest, sig);
        if (signer != q.maker) revert InvalidSigner();
    }
}
