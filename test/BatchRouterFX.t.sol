// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BatchRegistry} from "../src/BatchRegistry.sol";
import {BatchRouter} from "../src/BatchRouter.sol";
import {MockFxAdapter} from "../src/MockFxAdapter.sol";
import {IFXAdapter} from "../src/interfaces/IFXAdapter.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockBRLA is ERC20 {
    constructor() ERC20("Brazilian Real Aprov.", "BRLA") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @dev Adapter that always returns LESS than what was asked for — used to
///      simulate slippage failure inside the adapter (FxEscrowAdapter would
///      revert with SlippageExceeded; the router expects that propagated).
contract UnderdeliveringAdapter is IFXAdapter {
    function swap(uint256 amountIn, address tokenOut, uint256 minAmountOut, bytes calldata)
        external
        returns (uint256 amountOut)
    {
        amountIn; tokenOut; minAmountOut;
        // Always revert; the test only needs the failure path.
        revert("UnderdeliveringAdapter: forced revert");
    }
}

/// @dev Adapter that delivers MORE than minAmountOut — used to test the
///      router's tight-equality FXAmountMismatch revert.
contract OverdeliveringAdapter is IFXAdapter {
    using SafeTransfer for ERC20;
    address public immutable usdc;
    address public immutable brla;
    constructor(address _usdc, address _brla) { usdc = _usdc; brla = _brla; }
    function swap(uint256 amountIn, address tokenOut, uint256 /*min*/, bytes calldata)
        external
        returns (uint256 amountOut)
    {
        ERC20(usdc).transferFrom(msg.sender, address(this), amountIn);
        // Always over-deliver: 2× the minAmountOut.
        amountOut = amountIn * 10; // arbitrary, way more than needed
        ERC20(brla).transfer(msg.sender, amountOut);
        return amountOut;
    }
}

library SafeTransfer {} // empty — using ERC20's built-in transfer in mocks

contract BatchRouterFXTest is Test {
    BatchRegistry public registry;
    BatchRouter public router;
    MockFxAdapter public adapter;
    MockUSDC public usdc;
    MockBRLA public brla;

    address public owner = makeAddr("owner");
    address public sender = makeAddr("sender");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    bytes32 public constant USDC_TICKER = bytes32("USDC");
    bytes32 public constant BRLA_TICKER = bytes32("BRLA");

    /// 1 USDC = 5 BRLA → rate is 5e18 (per MockFxAdapter scaling).
    uint256 public constant RATE = 5e18;
    uint256 public constant FEE = 1e6;

    event BatchSettled(bytes32 indexed batchId, uint256 totalDistributed, uint256 recipientCount);

    function setUp() public {
        usdc = new MockUSDC();
        brla = new MockBRLA();

        vm.prank(owner);
        registry = new BatchRegistry(address(usdc), FEE);

        // Deploy adapter (owned by `this` so we can configure rates here).
        adapter = new MockFxAdapter(address(usdc));
        adapter.setRate(address(brla), RATE);

        // Deploy router with FX corridor enabled: bytes32("BRLA") → BRLA.
        router = new BatchRouter(
            address(registry),
            address(usdc),
            BRLA_TICKER,
            address(brla),
            address(adapter)
        );

        vm.prank(owner);
        registry.setRouter(address(router));

        // Seed the adapter with BRLA reserves.
        brla.mint(address(adapter), 10_000_000e18);

        // Sender has USDC, approves both registry and router.
        usdc.mint(sender, 100_000e6);
        vm.prank(sender);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(sender);
        usdc.approve(address(router), type(uint256).max);
    }

    // ─────────────────────── Helpers ───────────────────────

    function _brlaRecipients() internal view returns (BatchRegistry.Recipient[] memory rs) {
        // 100 BRLA + 250 BRLA + 150 BRLA = 500 BRLA total
        // → fundedAmount = 500e18 / 5e18 * 1e6 = 100_000_000 = 100 USDC
        rs = new BatchRegistry.Recipient[](3);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e18, outputCurrency: BRLA_TICKER});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 250e18, outputCurrency: BRLA_TICKER});
        rs[2] = BatchRegistry.Recipient({wallet: charlie, amount: 150e18, outputCurrency: BRLA_TICKER});
    }

    function _createBrlaBatch() internal returns (bytes32 batchId, uint256 totalBrla, uint256 fundedUsdc) {
        BatchRegistry.Recipient[] memory rs = _brlaRecipients();
        vm.prank(sender);
        batchId = registry.createBatch(rs);
        totalBrla = 500e18;
        // Required USDC to produce exactly totalBrla at rate 5e18:
        // amountOut = amountIn * rate / 1e6 → amountIn = amountOut * 1e6 / rate
        fundedUsdc = (totalBrla * 1e6) / RATE;
    }

    // ========================================================================
    // FX corridor — happy path
    // ========================================================================

    function test_FXExecute_HappyPath_DistributesBRLAToAllRecipients() public {
        (bytes32 batchId, uint256 totalBrla, uint256 fundedUsdc) = _createBrlaBatch();

        vm.prank(sender);
        router.execute(batchId, fundedUsdc, 50, "");

        assertEq(brla.balanceOf(alice), 100e18);
        assertEq(brla.balanceOf(bob), 250e18);
        assertEq(brla.balanceOf(charlie), 150e18);
        assertEq(brla.balanceOf(address(router)), 0, "router must not retain BRLA");
        assertEq(usdc.balanceOf(address(router)), 0, "router must not retain USDC");
        // Adapter received the swapped USDC.
        assertEq(usdc.balanceOf(address(adapter)), fundedUsdc);
        totalBrla; // silence
    }

    function test_FXExecute_HappyPath_StatusTransitionsToSettled() public {
        (bytes32 batchId, , uint256 fundedUsdc) = _createBrlaBatch();
        vm.prank(sender);
        router.execute(batchId, fundedUsdc, 50, "");
        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Settled));
    }

    function test_FXExecute_HappyPath_EmitsBatchSettledWithBrlaTotal() public {
        (bytes32 batchId, uint256 totalBrla, uint256 fundedUsdc) = _createBrlaBatch();

        vm.expectEmit(true, false, false, true, address(router));
        emit BatchSettled(batchId, totalBrla, 3);

        vm.prank(sender);
        router.execute(batchId, fundedUsdc, 50, "");
    }

    // ========================================================================
    // FX corridor — revert paths
    // ========================================================================

    function test_FXExecute_RevertWhen_AmountMismatch_OverFunded() public {
        // Fund 1 USDC extra → adapter returns 5 BRLA extra → not equal to totalNeeded.
        (bytes32 batchId, uint256 totalBrla, uint256 fundedUsdc) = _createBrlaBatch();
        uint256 over = fundedUsdc + 1e6;

        vm.prank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(BatchRouter.FXAmountMismatch.selector, totalBrla + 5e18, totalBrla)
        );
        router.execute(batchId, over, 50, "");
    }

    function test_FXExecute_RevertWhen_AmountMismatch_UnderFunded() public {
        // Fund less → adapter delivers less → adapter slippage check trips first.
        (bytes32 batchId, , uint256 fundedUsdc) = _createBrlaBatch();
        uint256 under = fundedUsdc - 1e6;

        vm.prank(sender);
        // Adapter's SlippageExceeded(actual, min) — actual = under*5, min = totalNeeded = 500e18
        vm.expectRevert(
            abi.encodeWithSelector(MockFxAdapter.SlippageExceeded.selector, under * RATE / 1e6, 500e18)
        );
        router.execute(batchId, under, 50, "");
    }

    function test_FXExecute_RevertWhen_AdapterReverts() public {
        // Substitute a router whose adapter always reverts; reuse same registry.
        UnderdeliveringAdapter bad = new UnderdeliveringAdapter();
        // Need a fresh registry/router pair because registry has setRouter as single-shot.
        MockUSDC u = new MockUSDC();
        vm.prank(owner);
        BatchRegistry r = new BatchRegistry(address(u), FEE);
        BatchRouter rtr = new BatchRouter(address(r), address(u), BRLA_TICKER, address(brla), address(bad));
        vm.prank(owner);
        r.setRouter(address(rtr));

        u.mint(sender, 1_000e6);
        vm.prank(sender);
        u.approve(address(r), type(uint256).max);
        vm.prank(sender);
        u.approve(address(rtr), type(uint256).max);

        BatchRegistry.Recipient[] memory rs = _brlaRecipients();
        vm.prank(sender);
        bytes32 batchId = r.createBatch(rs);

        vm.prank(sender);
        vm.expectRevert(bytes("UnderdeliveringAdapter: forced revert"));
        rtr.execute(batchId, 100e6, 50, "");
    }

    // ========================================================================
    // Mixed-corridor invariant on FX-enabled router
    // ========================================================================

    function test_FXExecute_RevertWhen_MixedUSDCAndBRLA() public {
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](2);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e18, outputCurrency: BRLA_TICKER});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 100e6, outputCurrency: USDC_TICKER});

        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        vm.prank(sender);
        vm.expectRevert(BatchRouter.MixedCorridorNotSupported.selector);
        router.execute(batchId, 1_000e6, 50, "");
    }

    function test_FXExecute_RevertWhen_TickerNotConfigured() public {
        // Use a third ticker the router doesn't know.
        bytes32 JPYC = bytes32("JPYC");
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](1);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e18, outputCurrency: JPYC});

        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(BatchRouter.UnsupportedCurrency.selector, JPYC));
        router.execute(batchId, 100e6, 50, "");
    }

    // ========================================================================
    // FX router still handles a plain USDC batch
    // ========================================================================

    function test_FXEnabledRouter_StillHandlesUSDCCorridor() public {
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](2);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e6, outputCurrency: USDC_TICKER});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 50e6, outputCurrency: USDC_TICKER});
        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        vm.prank(sender);
        router.execute(batchId, 150e6, 50, "");

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 50e6);
        assertEq(brla.balanceOf(alice), 0, "USDC corridor must not touch BRLA path");
    }
}
