// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BatchRegistry} from "../src/BatchRegistry.sol";
import {BatchRouter} from "../src/BatchRouter.sol";

/// @dev Plain mintable USDC. Real Arc USDC is at 0x36..0000 with 6 decimals.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev USDC variant that reverts transfers to / from a blocklisted address.
///      Used to simulate a recipient transfer leg failing (e.g., real-world USDC freezes).
contract BlocklistableMockUSDC is ERC20 {
    mapping(address => bool) public blocklisted;

    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocklisted(address a, bool b) external {
        blocklisted[a] = b;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocklisted[from] || blocklisted[to]) revert("USDC: blocklisted");
        super._update(from, to, value);
    }
}

contract BatchRouterTest is Test {
    BatchRegistry public registry;
    BatchRouter public router;
    MockUSDC public usdc;

    address public owner = makeAddr("owner");
    address public sender = makeAddr("sender");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public eve = makeAddr("eve");

    uint256 public constant FEE = 1e6;
    bytes32 public constant USDC_TICKER = bytes32("USDC");
    bytes32 public constant BRLA = bytes32("BRLA");

    // Mirrored events for vm.expectEmit.
    event BatchSettled(bytes32 indexed batchId, uint256 totalDistributed, uint256 recipientCount);
    event StatusUpdated(
        bytes32 indexed batchId,
        BatchRegistry.Status oldStatus,
        BatchRegistry.Status newStatus
    );

    function setUp() public {
        usdc = new MockUSDC();

        vm.prank(owner);
        registry = new BatchRegistry(address(usdc), FEE);

        router = new BatchRouter(address(registry), address(usdc), bytes32(0), address(0), address(0));

        vm.prank(owner);
        registry.setRouter(address(router));

        // Fund sender with USDC for fees + future funding.
        usdc.mint(sender, 10_000e6);
        vm.prank(sender);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(sender);
        usdc.approve(address(router), type(uint256).max);
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    function _usdcRecipients() internal view returns (BatchRegistry.Recipient[] memory rs) {
        rs = new BatchRegistry.Recipient[](3);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e6, outputCurrency: USDC_TICKER});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 250e6, outputCurrency: USDC_TICKER});
        rs[2] = BatchRegistry.Recipient({wallet: charlie, amount: 50e6, outputCurrency: USDC_TICKER});
    }

    function _createUsdcBatch() internal returns (bytes32 batchId, uint256 totalNeeded) {
        BatchRegistry.Recipient[] memory rs = _usdcRecipients();
        vm.prank(sender);
        batchId = registry.createBatch(rs);
        totalNeeded = 100e6 + 250e6 + 50e6;
    }

    // ========================================================================
    // Constructor
    // ========================================================================

    function test_Constructor_StoresRegistry() public view {
        assertEq(address(router.registry()), address(registry));
    }

    function test_Constructor_StoresUSDC() public view {
        assertEq(address(router.usdc()), address(usdc));
    }

    function test_Constructor_RevertWhen_RegistryIsZero() public {
        vm.expectRevert(BatchRouter.ZeroAddress.selector);
        new BatchRouter(address(0), address(usdc), bytes32(0), address(0), address(0));
    }

    function test_Constructor_RevertWhen_USDCIsZero() public {
        vm.expectRevert(BatchRouter.ZeroAddress.selector);
        new BatchRouter(address(registry), address(0), bytes32(0), address(0), address(0));
    }

    function test_Constructor_FXDisabled_StoresZeroes() public view {
        // The shared `router` in setUp() is FX-disabled; verify storage.
        assertEq(router.fxTicker(), bytes32(0));
        assertEq(address(router.fxToken()), address(0));
        assertEq(address(router.fxAdapter()), address(0));
    }

    function test_Constructor_RevertWhen_FXTickerIsUSDC() public {
        // bytes32("USDC") is reserved for the native corridor.
        vm.expectRevert(BatchRouter.InvalidCorridorConfig.selector);
        new BatchRouter(address(registry), address(usdc), USDC_TICKER, address(usdc), makeAddr("adapter"));
    }

    function test_Constructor_RevertWhen_FXEnabledWithoutToken() public {
        vm.expectRevert(BatchRouter.InvalidCorridorConfig.selector);
        new BatchRouter(address(registry), address(usdc), BRLA, address(0), makeAddr("adapter"));
    }

    function test_Constructor_RevertWhen_FXEnabledWithoutAdapter() public {
        vm.expectRevert(BatchRouter.InvalidCorridorConfig.selector);
        new BatchRouter(address(registry), address(usdc), BRLA, makeAddr("brla"), address(0));
    }

    function test_Constructor_RevertWhen_FXDisabledButTokenProvided() public {
        // Mismatched config: ticker zero but token non-zero.
        vm.expectRevert(BatchRouter.InvalidCorridorConfig.selector);
        new BatchRouter(address(registry), address(usdc), bytes32(0), makeAddr("brla"), address(0));
    }

    function test_Constructor_RevertWhen_FXDisabledButAdapterProvided() public {
        vm.expectRevert(BatchRouter.InvalidCorridorConfig.selector);
        new BatchRouter(address(registry), address(usdc), bytes32(0), address(0), makeAddr("adapter"));
    }

    // ========================================================================
    // execute — revert cases
    // ========================================================================

    function test_Execute_RevertWhen_BatchNotFound() public {
        vm.prank(sender);
        vm.expectRevert(BatchRouter.BatchNotFound.selector);
        router.execute(bytes32(uint256(0xdead)), 1_000e6, 50, "");
    }

    function test_Execute_RevertWhen_SlippageOver10000() public {
        (bytes32 batchId,) = _createUsdcBatch();
        vm.prank(sender);
        vm.expectRevert(BatchRouter.InvalidSlippage.selector);
        router.execute(batchId, 1_000e6, 10_001, "");
    }

    function test_Execute_RevertWhen_InsufficientFunding() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        vm.prank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(BatchRouter.InsufficientFunding.selector, totalNeeded - 1, totalNeeded)
        );
        router.execute(batchId, totalNeeded - 1, 50, "");
    }

    function test_Execute_RevertWhen_RecipientCurrencyMixed() public {
        // Mixed-currency batch: one BRLA, two USDC. Single-corridor v1
        // requires every recipient share one ticker; mixed → revert.
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](3);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e6, outputCurrency: USDC_TICKER});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 250e6, outputCurrency: BRLA});
        rs[2] = BatchRegistry.Recipient({wallet: charlie, amount: 50e6, outputCurrency: USDC_TICKER});

        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        vm.prank(sender);
        vm.expectRevert(BatchRouter.MixedCorridorNotSupported.selector);
        router.execute(batchId, 1_000e6, 50, "");
    }

    function test_Execute_RevertWhen_AllRecipientsUseUnknownTicker_AndFXDisabled() public {
        // FX is disabled in this suite. A batch where every recipient targets
        // a non-USDC ticker has no execution path → UnsupportedCurrency.
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](2);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e6, outputCurrency: BRLA});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 50e6, outputCurrency: BRLA});

        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(BatchRouter.UnsupportedCurrency.selector, BRLA));
        router.execute(batchId, 1_000e6, 50, "");
    }

    function test_Execute_RevertWhen_RouterNotApproved() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();

        // Revoke approval.
        vm.prank(sender);
        usdc.approve(address(router), 0);

        vm.prank(sender);
        vm.expectRevert(); // OZ ERC20InsufficientAllowance
        router.execute(batchId, totalNeeded, 50, "");
    }

    function test_Execute_RevertWhen_BatchAlreadySettled() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");

        // Second call must revert because status is now Settled.
        vm.prank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchRouter.InvalidBatchStatus.selector, BatchRegistry.Status.Settled
            )
        );
        router.execute(batchId, totalNeeded, 50, "");
    }

    // ========================================================================
    // execute — happy path
    // ========================================================================

    function test_Execute_HappyPath_DistributesUSDCToAllRecipients() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();

        uint256 senderBefore = usdc.balanceOf(sender);

        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 250e6);
        assertEq(usdc.balanceOf(charlie), 50e6);
        assertEq(usdc.balanceOf(sender), senderBefore - totalNeeded);
    }

    function test_Execute_HappyPath_StatusTransitionsToSettled() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();

        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Settled));
    }

    function test_Execute_HappyPath_RouterHoldsZeroUSDCAfterSettlement() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");

        assertEq(usdc.balanceOf(address(router)), 0, "router must not retain USDC");
    }

    function test_Execute_HappyPath_RefundsExcess() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        uint256 overFund = totalNeeded + 7e6;

        uint256 senderBefore = usdc.balanceOf(sender);

        vm.prank(sender);
        router.execute(batchId, overFund, 50, "");

        assertEq(usdc.balanceOf(sender), senderBefore - totalNeeded, "sender net debit == totalNeeded");
        assertEq(usdc.balanceOf(address(router)), 0);
    }

    function test_Execute_HappyPath_NoRefundWhenExact() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        uint256 senderBefore = usdc.balanceOf(sender);

        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");

        assertEq(usdc.balanceOf(sender), senderBefore - totalNeeded);
    }

    function test_Execute_HappyPath_EmitsBatchSettled() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();

        vm.expectEmit(true, false, false, true, address(router));
        emit BatchSettled(batchId, totalNeeded, 3);

        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");
    }

    function test_Execute_HappyPath_EmitsStatusUpdates() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();

        // Funded and Executing both come from the registry contract.
        vm.expectEmit(true, false, false, true, address(registry));
        emit StatusUpdated(batchId, BatchRegistry.Status.Pending, BatchRegistry.Status.Funded);

        vm.expectEmit(true, false, false, true, address(registry));
        emit StatusUpdated(batchId, BatchRegistry.Status.Funded, BatchRegistry.Status.Executing);

        vm.expectEmit(true, false, false, true, address(registry));
        emit StatusUpdated(batchId, BatchRegistry.Status.Executing, BatchRegistry.Status.Settled);

        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");
    }

    function test_Execute_HappyPath_AcceptsZeroSlippage() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        vm.prank(sender);
        router.execute(batchId, totalNeeded, 0, "");
    }

    function test_Execute_HappyPath_AcceptsMaxSlippage10000() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        vm.prank(sender);
        router.execute(batchId, totalNeeded, 10_000, "");
    }

    // ========================================================================
    // Atomicity
    // ========================================================================

    function test_Execute_AtomicRevert_WhenRecipientTransferFails() public {
        // Use blocklistable USDC: deploy fresh registry+router that point at it.
        BlocklistableMockUSDC bUsdc = new BlocklistableMockUSDC();

        vm.prank(owner);
        BatchRegistry bRegistry = new BatchRegistry(address(bUsdc), FEE);
        BatchRouter bRouter = new BatchRouter(address(bRegistry), address(bUsdc), bytes32(0), address(0), address(0));
        vm.prank(owner);
        bRegistry.setRouter(address(bRouter));

        bUsdc.mint(sender, 10_000e6);
        vm.prank(sender);
        bUsdc.approve(address(bRegistry), type(uint256).max);
        vm.prank(sender);
        bUsdc.approve(address(bRouter), type(uint256).max);

        BatchRegistry.Recipient[] memory rs = _usdcRecipients();
        vm.prank(sender);
        bytes32 batchId = bRegistry.createBatch(rs);
        uint256 totalNeeded = 100e6 + 250e6 + 50e6;

        // Blocklist Bob (the middle recipient).
        bUsdc.setBlocklisted(bob, true);

        // Snapshot pre-execute balances.
        uint256 senderBalBefore = bUsdc.balanceOf(sender);
        uint256 aliceBalBefore = bUsdc.balanceOf(alice);
        uint256 bobBalBefore = bUsdc.balanceOf(bob);
        uint256 charlieBalBefore = bUsdc.balanceOf(charlie);

        vm.prank(sender);
        vm.expectRevert(); // raw "USDC: blocklisted" string from the mock
        bRouter.execute(batchId, totalNeeded, 50, "");

        // All balances unchanged: atomicity proof.
        assertEq(bUsdc.balanceOf(sender), senderBalBefore);
        assertEq(bUsdc.balanceOf(alice), aliceBalBefore);
        assertEq(bUsdc.balanceOf(bob), bobBalBefore);
        assertEq(bUsdc.balanceOf(charlie), charlieBalBefore);

        // Status remained Pending: the failed tx unwound markFunded/markExecuting.
        BatchRegistry.Batch memory b = bRegistry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Pending));
    }

    // ========================================================================
    // State machine reentrancy guard
    // ========================================================================

    function test_Execute_StatusGuardPreventsReexecution() public {
        // First execute() succeeds; second on the same batch must fail.
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");

        // Re-fund sender so allowance / balance are not the limiting factor.
        usdc.mint(sender, totalNeeded);

        vm.prank(sender);
        vm.expectRevert(
            abi.encodeWithSelector(BatchRouter.InvalidBatchStatus.selector, BatchRegistry.Status.Settled)
        );
        router.execute(batchId, totalNeeded, 50, "");
    }

    // ========================================================================
    // Fuzz: distribution invariant
    // ========================================================================

    function testFuzz_Execute_DistributesAmountsAsRegistered(uint8 nRecipients, uint256 amountSeed) public {
        nRecipients = uint8(bound(uint256(nRecipients), 1, 10));

        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](nRecipients);
        uint256 totalNeeded;
        address[] memory wallets = new address[](nRecipients);

        for (uint256 i; i < nRecipients; ++i) {
            wallets[i] = address(uint160(uint256(keccak256(abi.encode(amountSeed, i, "fuzz")))));
            // Ensure non-zero, non-router, non-registry, non-sender, distinct.
            vm.assume(wallets[i] != address(0));
            vm.assume(wallets[i] != address(router));
            vm.assume(wallets[i] != address(registry));
            vm.assume(wallets[i] != sender);
            for (uint256 j; j < i; ++j) {
                vm.assume(wallets[i] != wallets[j]);
            }
            uint256 amt = bound(uint256(keccak256(abi.encode(amountSeed, i, "amt"))), 1, 1_000e6);
            rs[i] = BatchRegistry.Recipient({wallet: wallets[i], amount: amt, outputCurrency: USDC_TICKER});
            totalNeeded += amt;
        }

        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        // Top up sender if low.
        if (usdc.balanceOf(sender) < totalNeeded + FEE) {
            usdc.mint(sender, totalNeeded + FEE);
        }

        vm.prank(sender);
        router.execute(batchId, totalNeeded, 50, "");

        for (uint256 i; i < nRecipients; ++i) {
            assertEq(usdc.balanceOf(wallets[i]), rs[i].amount, "recipient amount mismatch");
        }
        assertEq(usdc.balanceOf(address(router)), 0, "router retained USDC");
    }
}
