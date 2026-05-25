// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IFXAdapter} from "../src/interfaces/IFXAdapter.sol";
import {MockFxAdapter} from "../src/MockFxAdapter.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Stand-in for BRLA. 18 decimals like most regional stablecoins on Arc.
contract MockBRLA is ERC20 {
    constructor() ERC20("Brazilian Real Aprov.", "BRLA") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockFxAdapterTest is Test {
    MockFxAdapter public adapter;
    MockUSDC public usdc;
    MockBRLA public brla;

    address public owner = makeAddr("owner");
    address public router = makeAddr("router");           // simulates BatchRouter (the caller)
    address public eve = makeAddr("eve");

    /// @dev rate scaling: rate is expressed as base-units-of-tokenOut per 1 USDC base unit,
    ///      multiplied by 1e6 to allow fractional rates without floating point.
    ///      Example: 1 USDC = 5.00 BRLA →
    ///        1 USDC has 6 dec → 1e6 base units
    ///        5 BRLA has 18 dec → 5e18 base units
    ///        rate = 5e18 / 1e6 * 1e6 = 5e18
    uint256 public constant RATE_USDC_BRLA = 5e18;

    event RateSet(address indexed tokenOut, uint256 rateScaled);
    event Swapped(address indexed caller, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    function setUp() public {
        usdc = new MockUSDC();
        brla = new MockBRLA();

        vm.prank(owner);
        adapter = new MockFxAdapter(address(usdc));

        vm.prank(owner);
        adapter.setRate(address(brla), RATE_USDC_BRLA);

        // Pre-fund the adapter with output tokens (the mock has no liquidity source).
        brla.mint(address(adapter), 1_000_000e18);
    }

    function _fundRouter(uint256 usdcAmount) internal {
        usdc.mint(router, usdcAmount);
        vm.prank(router);
        usdc.approve(address(adapter), type(uint256).max);
    }

    // ========================================================================
    // Constructor
    // ========================================================================

    function test_Constructor_StoresUSDC() public view {
        assertEq(address(adapter.usdc()), address(usdc));
    }

    function test_Constructor_StoresOwner() public view {
        assertEq(adapter.owner(), owner);
    }

    function test_Constructor_RevertWhen_USDCIsZero() public {
        vm.expectRevert(MockFxAdapter.ZeroAddress.selector);
        new MockFxAdapter(address(0));
    }

    // ========================================================================
    // setRate (admin)
    // ========================================================================

    function test_SetRate_RevertWhen_NotOwner() public {
        vm.prank(eve);
        vm.expectRevert(MockFxAdapter.NotOwner.selector);
        adapter.setRate(address(brla), 1);
    }

    function test_SetRate_RevertWhen_TokenOutIsZero() public {
        vm.prank(owner);
        vm.expectRevert(MockFxAdapter.ZeroAddress.selector);
        adapter.setRate(address(0), 1);
    }

    function test_SetRate_RevertWhen_TokenOutIsUSDC() public {
        // Disallow same-token "swaps" — the router would short-circuit those.
        vm.prank(owner);
        vm.expectRevert(MockFxAdapter.SameToken.selector);
        adapter.setRate(address(usdc), 1);
    }

    function test_SetRate_HappyPath_StoresRate() public {
        vm.prank(owner);
        adapter.setRate(address(brla), 9e18);
        assertEq(adapter.ratePerUsdc(address(brla)), 9e18);
    }

    function test_SetRate_HappyPath_EmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(adapter));
        emit RateSet(address(brla), 9e18);

        vm.prank(owner);
        adapter.setRate(address(brla), 9e18);
    }

    function test_SetRate_AcceptsZero_DisablesToken() public {
        vm.prank(owner);
        adapter.setRate(address(brla), 0);
        // Now swaps to brla should revert as unsupported.
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(MockFxAdapter.UnsupportedToken.selector, address(brla)));
        adapter.swap(100e6, address(brla), 0, "");
    }

    // ========================================================================
    // swap — revert cases
    // ========================================================================

    function test_Swap_RevertWhen_TokenOutUnsupported() public {
        _fundRouter(100e6);
        address foo = makeAddr("foo");
        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(MockFxAdapter.UnsupportedToken.selector, foo));
        adapter.swap(100e6, foo, 0, "");
    }

    function test_Swap_RevertWhen_AmountInIsZero() public {
        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(MockFxAdapter.ZeroAmount.selector);
        adapter.swap(0, address(brla), 0, "");
    }

    function test_Swap_RevertWhen_SlippageBreach() public {
        _fundRouter(100e6);
        // 100 USDC at 5 BRLA/USDC = 500 BRLA. Demand 501 BRLA → revert.
        uint256 want = 501e18;
        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(MockFxAdapter.SlippageExceeded.selector, 500e18, want));
        adapter.swap(100e6, address(brla), want, "");
    }

    function test_Swap_RevertWhen_RouterNotApproved() public {
        usdc.mint(router, 100e6); // mint, but no approval
        vm.prank(router);
        vm.expectRevert(); // OZ ERC20InsufficientAllowance
        adapter.swap(100e6, address(brla), 0, "");
    }

    function test_Swap_RevertWhen_AdapterUnderfunded() public {
        // Drain the adapter so it cannot deliver tokenOut.
        uint256 bal = brla.balanceOf(address(adapter));
        vm.prank(address(adapter));
        brla.transfer(eve, bal);

        _fundRouter(100e6);
        vm.prank(router);
        vm.expectRevert(); // ERC20InsufficientBalance
        adapter.swap(100e6, address(brla), 0, "");
    }

    // ========================================================================
    // swap — happy path
    // ========================================================================

    function test_Swap_HappyPath_ReturnsExpectedAmount() public {
        _fundRouter(100e6);

        vm.prank(router);
        uint256 out = adapter.swap(100e6, address(brla), 0, "");

        assertEq(out, 500e18, "100 USDC at 5 BRLA/USDC should yield 500 BRLA");
    }

    function test_Swap_HappyPath_PullsUSDCFromCaller() public {
        _fundRouter(100e6);
        uint256 routerBefore = usdc.balanceOf(router);
        uint256 adapterBefore = usdc.balanceOf(address(adapter));

        vm.prank(router);
        adapter.swap(100e6, address(brla), 0, "");

        assertEq(usdc.balanceOf(router), routerBefore - 100e6);
        assertEq(usdc.balanceOf(address(adapter)), adapterBefore + 100e6);
    }

    function test_Swap_HappyPath_DeliversBrlaToCaller() public {
        _fundRouter(100e6);
        uint256 routerBefore = brla.balanceOf(router);

        vm.prank(router);
        adapter.swap(100e6, address(brla), 0, "");

        assertEq(brla.balanceOf(router), routerBefore + 500e18);
    }

    function test_Swap_HappyPath_EmitsEvent() public {
        _fundRouter(100e6);
        vm.expectEmit(true, true, false, true, address(adapter));
        emit Swapped(router, address(brla), 100e6, 500e18);

        vm.prank(router);
        adapter.swap(100e6, address(brla), 0, "");
    }

    function test_Swap_HappyPath_AcceptsExactSlippageFloor() public {
        _fundRouter(100e6);
        vm.prank(router);
        uint256 out = adapter.swap(100e6, address(brla), 500e18, "");
        assertEq(out, 500e18);
    }

    function test_Swap_HappyPath_IgnoresExtraData() public {
        _fundRouter(100e6);
        vm.prank(router);
        uint256 out = adapter.swap(100e6, address(brla), 0, hex"deadbeef");
        assertEq(out, 500e18);
    }

    // ========================================================================
    // Fuzz
    // ========================================================================

    function testFuzz_Swap_HappyPath(uint256 amountIn) public {
        amountIn = bound(amountIn, 1, 100_000e6); // up to 100k USDC
        _fundRouter(amountIn);

        uint256 expected = (amountIn * RATE_USDC_BRLA) / 1e6;
        // Must keep adapter solvent; if expected > adapter's BRLA, top up.
        if (brla.balanceOf(address(adapter)) < expected) {
            brla.mint(address(adapter), expected);
        }

        vm.prank(router);
        uint256 out = adapter.swap(amountIn, address(brla), 0, "");
        assertEq(out, expected);
    }
}
