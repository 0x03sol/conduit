// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IFXAdapter} from "../src/interfaces/IFXAdapter.sol";
import {IFxEscrow} from "../src/interfaces/IFxEscrow.sol";
import {FxEscrowAdapter} from "../src/FxEscrowAdapter.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockBRLA is ERC20 {
    constructor() ERC20("Brazilian Real Aprov.", "BRLA") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Stand-in for Circle's FxEscrow. Implements `fillQuote` by performing
///      the atomic PvP transfer that the real escrow would. No signature
///      checking — this mock is solely a stand-in for adapter testing; the
///      adapter's pre-call quote validation is what we're exercising.
contract MockFxEscrow is IFxEscrow {
    using SafeTransferLib for ERC20;

    error QuoteExpired();
    error MakerInsufficientApproval();

    function fillQuote(Quote calldata q, bytes calldata /* makerSig */)
        external
        returns (uint256 amountOut)
    {
        if (block.timestamp >= q.expiry) revert QuoteExpired();
        // Pull tokenIn from taker (this == msg.sender from the adapter's POV).
        ERC20(q.tokenIn).transferFrom(msg.sender, q.maker, q.amountIn);
        // Pull tokenOut from maker → taker (msg.sender). Real escrow uses Permit2
        // here; the mock just relies on a regular allowance from maker to escrow.
        ERC20(q.tokenOut).transferFrom(q.maker, msg.sender, q.amountOut);
        amountOut = q.amountOut;
    }
}

/// @dev Trivial copy of OZ's SafeTransferLib trimmed for this file.
library SafeTransferLib {
    error TransferFailed();
}

contract FxEscrowAdapterTest is Test {
    FxEscrowAdapter public adapter;
    MockFxEscrow public escrow;
    MockUSDC public usdc;
    MockBRLA public brla;

    // Maker is a known private key so we can sign quotes off-chain in tests.
    uint256 public constant MAKER_PK = 0xA11CE;
    address public maker;

    address public router = makeAddr("router");
    address public eve = makeAddr("eve");

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address maker,address taker,uint256 expiry,uint256 nonce)"
    );

    event Swapped(
        address indexed caller,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address maker,
        uint256 nonce
    );

    function setUp() public {
        maker = vm.addr(MAKER_PK);

        usdc = new MockUSDC();
        brla = new MockBRLA();
        escrow = new MockFxEscrow();
        adapter = new FxEscrowAdapter(address(usdc), address(escrow));

        // Allowlist maker so the adapter accepts quotes signed by it.
        adapter.setMakerAllowed(maker, true);

        // Maker has BRLA + has approved escrow.
        brla.mint(maker, 10_000_000e18);
        vm.prank(maker);
        brla.approve(address(escrow), type(uint256).max);
    }

    // ─────────────── helpers ───────────────

    function _fundRouter(uint256 amount) internal {
        usdc.mint(router, amount);
        vm.prank(router);
        usdc.approve(address(adapter), type(uint256).max);
    }

    function _quote(uint256 amountIn, uint256 amountOut, uint256 nonce, uint256 expiry, address takerAddr)
        internal
        view
        returns (IFxEscrow.Quote memory q)
    {
        q = IFxEscrow.Quote({
            tokenIn: address(usdc),
            tokenOut: address(brla),
            amountIn: amountIn,
            amountOut: amountOut,
            maker: maker,
            taker: takerAddr,
            expiry: expiry,
            nonce: nonce
        });
    }

    function _signQuote(IFxEscrow.Quote memory q, uint256 pk) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Conduit-FxEscrowAdapter")),
                keccak256(bytes("1")),
                block.chainid,
                address(adapter)
            )
        );
        bytes32 structHash = keccak256(
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
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _packed(IFxEscrow.Quote memory q, bytes memory sig) internal pure returns (bytes memory) {
        return abi.encode(q, sig);
    }

    // ========================================================================
    // Constructor
    // ========================================================================

    function test_Constructor_StoresUSDC() public view {
        assertEq(address(adapter.usdc()), address(usdc));
    }

    function test_Constructor_StoresEscrow() public view {
        assertEq(address(adapter.escrow()), address(escrow));
    }

    function test_Constructor_RevertWhen_USDCIsZero() public {
        vm.expectRevert(FxEscrowAdapter.ZeroAddress.selector);
        new FxEscrowAdapter(address(0), address(escrow));
    }

    function test_Constructor_RevertWhen_EscrowIsZero() public {
        vm.expectRevert(FxEscrowAdapter.ZeroAddress.selector);
        new FxEscrowAdapter(address(usdc), address(0));
    }

    // ========================================================================
    // Maker allowlist
    // ========================================================================

    function test_SetMakerAllowed_RevertWhen_NotOwner() public {
        vm.prank(eve);
        vm.expectRevert(FxEscrowAdapter.NotOwner.selector);
        adapter.setMakerAllowed(eve, true);
    }

    function test_SetMakerAllowed_HappyPath_StoresAndEmits() public {
        // Add then remove
        assertTrue(adapter.allowedMaker(maker));
        adapter.setMakerAllowed(maker, false);
        assertFalse(adapter.allowedMaker(maker));
    }

    // ========================================================================
    // swap — revert cases
    // ========================================================================

    function test_Swap_RevertWhen_AmountInIsZero() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.ZeroAmount.selector);
        adapter.swap(0, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_TokenInMismatch() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        q.tokenIn = address(0xDEAD); // tamper
        bytes memory sig = _signQuote(q, MAKER_PK);
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.TokenInMismatch.selector);
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_TokenOutMismatch() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.TokenOutMismatch.selector);
        adapter.swap(100e6, address(0xBEEF), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_AmountInDoesNotMatchQuote() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);
        _fundRouter(50e6);
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.AmountInMismatch.selector);
        adapter.swap(50e6, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_QuoteExpired() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp - 1, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.QuoteExpired.selector);
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_QuoteTakerNotAdapter() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, eve);
        bytes memory sig = _signQuote(q, MAKER_PK);
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.WrongTaker.selector);
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_MakerNotAllowed() public {
        adapter.setMakerAllowed(maker, false);
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(FxEscrowAdapter.UnknownMaker.selector, maker));
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_BadSignature() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, 0xBADF00D); // wrong key
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.InvalidSigner.selector);
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_RevertWhen_SlippageBreach() public {
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(FxEscrowAdapter.SlippageExceeded.selector, 500e18, 600e18));
        adapter.swap(100e6, address(brla), 600e18, _packed(q, sig));
    }

    function test_Swap_RevertWhen_NonceReplayed() public {
        _fundRouter(200e6);
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);

        vm.prank(router);
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));

        // Try the SAME quote again.
        vm.prank(router);
        vm.expectRevert(FxEscrowAdapter.QuoteAlreadyUsed.selector);
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));
    }

    // ========================================================================
    // swap — happy path
    // ========================================================================

    function test_Swap_HappyPath_PullsUSDC_DeliversBRLA() public {
        _fundRouter(100e6);
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);

        uint256 routerUsdcBefore = usdc.balanceOf(router);
        uint256 routerBrlaBefore = brla.balanceOf(router);
        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        uint256 makerBrlaBefore = brla.balanceOf(maker);

        vm.prank(router);
        uint256 out = adapter.swap(100e6, address(brla), 0, _packed(q, sig));

        assertEq(out, 500e18);
        assertEq(usdc.balanceOf(router), routerUsdcBefore - 100e6);
        assertEq(brla.balanceOf(router), routerBrlaBefore + 500e18);
        assertEq(usdc.balanceOf(maker), makerUsdcBefore + 100e6);
        assertEq(brla.balanceOf(maker), makerBrlaBefore - 500e18);
        // Adapter must not retain anything.
        assertEq(usdc.balanceOf(address(adapter)), 0);
        assertEq(brla.balanceOf(address(adapter)), 0);
    }

    function test_Swap_HappyPath_EmitsEvent() public {
        _fundRouter(100e6);
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);

        vm.expectEmit(true, true, false, true, address(adapter));
        emit Swapped(router, address(brla), 100e6, 500e18, maker, 1);

        vm.prank(router);
        adapter.swap(100e6, address(brla), 0, _packed(q, sig));
    }

    function test_Swap_HappyPath_AcceptsExactSlippageFloor() public {
        _fundRouter(100e6);
        IFxEscrow.Quote memory q = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        bytes memory sig = _signQuote(q, MAKER_PK);
        vm.prank(router);
        uint256 out = adapter.swap(100e6, address(brla), 500e18, _packed(q, sig));
        assertEq(out, 500e18);
    }

    function test_Swap_HappyPath_DistinctNoncesWork() public {
        _fundRouter(200e6);
        IFxEscrow.Quote memory q1 = _quote(100e6, 500e18, 1, block.timestamp + 60, address(adapter));
        IFxEscrow.Quote memory q2 = _quote(100e6, 500e18, 2, block.timestamp + 60, address(adapter));
        vm.prank(router);
        adapter.swap(100e6, address(brla), 0, _packed(q1, _signQuote(q1, MAKER_PK)));
        vm.prank(router);
        adapter.swap(100e6, address(brla), 0, _packed(q2, _signQuote(q2, MAKER_PK)));
    }
}
