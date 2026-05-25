// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BatchRegistry} from "../src/BatchRegistry.sol";

/// @dev Minimal mintable USDC for tests. Real USDC on Arc is at
///      0x3600000000000000000000000000000000000000 with 6 decimals.
contract MockUSDC is ERC20 {
    uint8 private immutable _decimals;

    constructor() ERC20("USD Coin", "USDC") {
        _decimals = 6;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BatchRegistryTest is Test {
    BatchRegistry public registry;
    MockUSDC public usdc;

    address public owner = makeAddr("owner");
    address public sender = makeAddr("sender");
    address public sender2 = makeAddr("sender2");
    address public router = makeAddr("router");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public eve = makeAddr("eve");

    uint256 public constant REGISTRATION_FEE = 1e6; // 1 USDC (6 decimals)
    bytes32 public constant BRLA = bytes32("BRLA");
    bytes32 public constant JPYC = bytes32("JPYC");

    // Mirror of the contract's events for vm.expectEmit checking.
    event BatchCreated(
        bytes32 indexed batchId,
        address indexed sender,
        uint256 totalAmountSum,
        uint256 recipientCount
    );
    event RouterSet(address indexed router);
    event RegistrationFeeSet(uint256 oldFee, uint256 newFee);
    event StatusUpdated(
        bytes32 indexed batchId,
        BatchRegistry.Status oldStatus,
        BatchRegistry.Status newStatus
    );

    function setUp() public {
        usdc = new MockUSDC();

        vm.prank(owner);
        registry = new BatchRegistry(address(usdc), REGISTRATION_FEE);

        // Fund senders with USDC and pre-approve the registry for fees.
        usdc.mint(sender, 1_000e6);
        usdc.mint(sender2, 1_000e6);

        vm.prank(sender);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(sender2);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    function _threeRecipients() internal view returns (BatchRegistry.Recipient[] memory rs) {
        rs = new BatchRegistry.Recipient[](3);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e6, outputCurrency: BRLA});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 250e6, outputCurrency: BRLA});
        rs[2] = BatchRegistry.Recipient({wallet: charlie, amount: 50e6, outputCurrency: BRLA});
    }

    function _expectedBatchId(address s, BatchRegistry.Recipient[] memory rs, uint64 nonce)
        internal
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(s, block.chainid, rs, nonce));
    }

    // ========================================================================
    // Constructor
    // ========================================================================

    function test_Constructor_StoresUSDC() public view {
        assertEq(address(registry.usdc()), address(usdc));
    }

    function test_Constructor_StoresInitialFee() public view {
        assertEq(registry.registrationFee(), REGISTRATION_FEE);
    }

    function test_Constructor_StoresOwner() public view {
        assertEq(registry.owner(), owner);
    }

    function test_Constructor_RevertWhen_USDCIsZero() public {
        vm.expectRevert(BatchRegistry.ZeroAddress.selector);
        new BatchRegistry(address(0), REGISTRATION_FEE);
    }

    // ========================================================================
    // setRouter
    // ========================================================================

    function test_SetRouter_RevertWhen_NotOwner() public {
        vm.prank(eve);
        vm.expectRevert(BatchRegistry.NotOwner.selector);
        registry.setRouter(router);
    }

    function test_SetRouter_RevertWhen_ZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(BatchRegistry.ZeroAddress.selector);
        registry.setRouter(address(0));
    }

    function test_SetRouter_RevertWhen_AlreadySet() public {
        vm.prank(owner);
        registry.setRouter(router);

        vm.prank(owner);
        vm.expectRevert(BatchRegistry.RouterAlreadySet.selector);
        registry.setRouter(eve); // try to overwrite
    }

    function test_SetRouter_HappyPath_StoresAddress() public {
        vm.prank(owner);
        registry.setRouter(router);

        assertEq(registry.router(), router);
    }

    function test_SetRouter_HappyPath_EmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit RouterSet(router);

        vm.prank(owner);
        registry.setRouter(router);
    }

    // ========================================================================
    // setRegistrationFee
    // ========================================================================

    function test_SetRegistrationFee_RevertWhen_NotOwner() public {
        vm.prank(eve);
        vm.expectRevert(BatchRegistry.NotOwner.selector);
        registry.setRegistrationFee(2e6);
    }

    function test_SetRegistrationFee_HappyPath_UpdatesFee() public {
        vm.prank(owner);
        registry.setRegistrationFee(2e6);

        assertEq(registry.registrationFee(), 2e6);
    }

    function test_SetRegistrationFee_HappyPath_EmitsEvent() public {
        vm.expectEmit(false, false, false, true, address(registry));
        emit RegistrationFeeSet(REGISTRATION_FEE, 2e6);

        vm.prank(owner);
        registry.setRegistrationFee(2e6);
    }

    function test_SetRegistrationFee_HappyPath_AllowsZero() public {
        vm.prank(owner);
        registry.setRegistrationFee(0);
        assertEq(registry.registrationFee(), 0);
    }

    // ========================================================================
    // createBatch — revert cases
    // ========================================================================

    function test_CreateBatch_RevertWhen_EmptyRecipients() public {
        BatchRegistry.Recipient[] memory empty = new BatchRegistry.Recipient[](0);
        vm.prank(sender);
        vm.expectRevert(BatchRegistry.EmptyRecipients.selector);
        registry.createBatch(empty);
    }

    function test_CreateBatch_RevertWhen_RecipientWalletZero() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        rs[1].wallet = address(0);

        vm.prank(sender);
        vm.expectRevert(BatchRegistry.ZeroRecipientWallet.selector);
        registry.createBatch(rs);
    }

    function test_CreateBatch_RevertWhen_RecipientAmountZero() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        rs[2].amount = 0;

        vm.prank(sender);
        vm.expectRevert(BatchRegistry.ZeroRecipientAmount.selector);
        registry.createBatch(rs);
    }

    function test_CreateBatch_RevertWhen_FeePullFails() public {
        // sender2 has tokens but did NOT approve. Approval set in setUp;
        // explicitly clear it for this test.
        vm.prank(sender2);
        usdc.approve(address(registry), 0);

        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        vm.prank(sender2);
        vm.expectRevert(); // OZ ERC20InsufficientAllowance
        registry.createBatch(rs);
    }

    // ========================================================================
    // createBatch — happy path
    // ========================================================================

    function test_CreateBatch_HappyPath_ReturnsExpectedBatchId() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        bytes32 expected = _expectedBatchId(sender, rs, 0);

        vm.prank(sender);
        bytes32 actual = registry.createBatch(rs);

        assertEq(actual, expected);
    }

    function test_CreateBatch_HappyPath_PullsFeeFromSender() public {
        uint256 senderBefore = usdc.balanceOf(sender);
        uint256 registryBefore = usdc.balanceOf(address(registry));

        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        vm.prank(sender);
        registry.createBatch(rs);

        assertEq(usdc.balanceOf(sender), senderBefore - REGISTRATION_FEE);
        assertEq(usdc.balanceOf(address(registry)), registryBefore + REGISTRATION_FEE);
    }

    function test_CreateBatch_HappyPath_StoresBatchSenderAndStatus() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(b.sender, sender);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Pending));
        assertEq(b.totalAmountSum, 100e6 + 250e6 + 50e6);
    }

    function test_CreateBatch_HappyPath_StoresRecipients() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        vm.prank(sender);
        bytes32 batchId = registry.createBatch(rs);

        BatchRegistry.Recipient[] memory stored = registry.getRecipients(batchId);
        assertEq(stored.length, 3);
        assertEq(stored[0].wallet, alice);
        assertEq(stored[0].amount, 100e6);
        assertEq(stored[0].outputCurrency, BRLA);
        assertEq(stored[1].wallet, bob);
        assertEq(stored[2].wallet, charlie);
    }

    function test_CreateBatch_HappyPath_EmitsEvent() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        bytes32 expected = _expectedBatchId(sender, rs, 0);

        vm.expectEmit(true, true, false, true, address(registry));
        emit BatchCreated(expected, sender, 400e6, 3);

        vm.prank(sender);
        registry.createBatch(rs);
    }

    function test_CreateBatch_IncrementsPerSenderNonce() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();

        vm.prank(sender);
        registry.createBatch(rs);
        assertEq(registry.batchNonce(sender), 1);

        vm.prank(sender);
        registry.createBatch(rs);
        assertEq(registry.batchNonce(sender), 2);
    }

    function test_CreateBatch_SameInputsTwice_ProducesDifferentIds() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();

        vm.prank(sender);
        bytes32 id1 = registry.createBatch(rs);

        vm.prank(sender);
        bytes32 id2 = registry.createBatch(rs);

        assertTrue(id1 != id2, "nonce must disambiguate identical batches");
    }

    function test_CreateBatch_DifferentSenders_ProduceDifferentIds() public {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();

        vm.prank(sender);
        bytes32 id1 = registry.createBatch(rs);

        vm.prank(sender2);
        bytes32 id2 = registry.createBatch(rs);

        assertTrue(id1 != id2);
    }

    function test_CreateBatch_AcceptsZeroFeeIfOwnerSetIt() public {
        vm.prank(owner);
        registry.setRegistrationFee(0);

        // sender2 with no approval should still succeed if fee is zero.
        vm.prank(sender2);
        usdc.approve(address(registry), 0);

        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        uint256 before = usdc.balanceOf(sender2);

        vm.prank(sender2);
        registry.createBatch(rs);

        // No fee was pulled.
        assertEq(usdc.balanceOf(sender2), before);
    }

    // ========================================================================
    // Status transitions: markFunded
    // ========================================================================

    function _createBatch() internal returns (bytes32) {
        BatchRegistry.Recipient[] memory rs = _threeRecipients();
        vm.prank(sender);
        return registry.createBatch(rs);
    }

    function _setRouter() internal {
        vm.prank(owner);
        registry.setRouter(router);
    }

    function test_MarkFunded_RevertWhen_NotRouter() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.prank(eve);
        vm.expectRevert(BatchRegistry.NotRouter.selector);
        registry.markFunded(batchId);
    }

    function test_MarkFunded_RevertWhen_BatchNotFound() public {
        _setRouter();
        vm.prank(router);
        vm.expectRevert(BatchRegistry.BatchNotFound.selector);
        registry.markFunded(bytes32(uint256(0xdead)));
    }

    function test_MarkFunded_RevertWhen_NotPending() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.prank(router);
        registry.markFunded(batchId); // Pending → Funded

        vm.prank(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchRegistry.InvalidStatusTransition.selector,
                BatchRegistry.Status.Funded,
                BatchRegistry.Status.Funded
            )
        );
        registry.markFunded(batchId); // already Funded
    }

    function test_MarkFunded_HappyPath_TransitionsToFunded() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.prank(router);
        registry.markFunded(batchId);

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Funded));
    }

    function test_MarkFunded_HappyPath_EmitsEvent() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.expectEmit(true, false, false, true, address(registry));
        emit StatusUpdated(batchId, BatchRegistry.Status.Pending, BatchRegistry.Status.Funded);

        vm.prank(router);
        registry.markFunded(batchId);
    }

    // ========================================================================
    // Status transitions: markExecuting
    // ========================================================================

    function test_MarkExecuting_RevertWhen_NotRouter() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.prank(router);
        registry.markFunded(batchId);

        vm.prank(eve);
        vm.expectRevert(BatchRegistry.NotRouter.selector);
        registry.markExecuting(batchId);
    }

    function test_MarkExecuting_RevertWhen_NotFunded() public {
        _setRouter();
        bytes32 batchId = _createBatch(); // Pending

        vm.prank(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchRegistry.InvalidStatusTransition.selector,
                BatchRegistry.Status.Pending,
                BatchRegistry.Status.Executing
            )
        );
        registry.markExecuting(batchId);
    }

    function test_MarkExecuting_HappyPath_TransitionsToExecuting() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.prank(router);
        registry.markFunded(batchId);

        vm.prank(router);
        registry.markExecuting(batchId);

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Executing));
    }

    // ========================================================================
    // Status transitions: markSettled
    // ========================================================================

    function test_MarkSettled_RevertWhen_NotRouter() public {
        _setRouter();
        bytes32 batchId = _createBatch();
        vm.prank(router);
        registry.markFunded(batchId);
        vm.prank(router);
        registry.markExecuting(batchId);

        vm.prank(eve);
        vm.expectRevert(BatchRegistry.NotRouter.selector);
        registry.markSettled(batchId);
    }

    function test_MarkSettled_RevertWhen_NotExecuting() public {
        _setRouter();
        bytes32 batchId = _createBatch();
        vm.prank(router);
        registry.markFunded(batchId);

        vm.prank(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchRegistry.InvalidStatusTransition.selector,
                BatchRegistry.Status.Funded,
                BatchRegistry.Status.Settled
            )
        );
        registry.markSettled(batchId);
    }

    function test_MarkSettled_HappyPath_TransitionsToSettled() public {
        _setRouter();
        bytes32 batchId = _createBatch();
        vm.prank(router);
        registry.markFunded(batchId);
        vm.prank(router);
        registry.markExecuting(batchId);
        vm.prank(router);
        registry.markSettled(batchId);

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Settled));
    }

    // ========================================================================
    // Status transitions: markReverted (terminal escape hatch from any non-terminal state)
    // ========================================================================

    function test_MarkReverted_RevertWhen_NotRouter() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.prank(eve);
        vm.expectRevert(BatchRegistry.NotRouter.selector);
        registry.markReverted(batchId);
    }

    function test_MarkReverted_HappyPath_FromPending() public {
        _setRouter();
        bytes32 batchId = _createBatch();

        vm.prank(router);
        registry.markReverted(batchId);

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Reverted));
    }

    function test_MarkReverted_HappyPath_FromExecuting() public {
        _setRouter();
        bytes32 batchId = _createBatch();
        vm.prank(router);
        registry.markFunded(batchId);
        vm.prank(router);
        registry.markExecuting(batchId);
        vm.prank(router);
        registry.markReverted(batchId);

        BatchRegistry.Batch memory b = registry.getBatch(batchId);
        assertEq(uint8(b.status), uint8(BatchRegistry.Status.Reverted));
    }

    function test_MarkReverted_RevertWhen_AlreadySettled() public {
        _setRouter();
        bytes32 batchId = _createBatch();
        vm.prank(router);
        registry.markFunded(batchId);
        vm.prank(router);
        registry.markExecuting(batchId);
        vm.prank(router);
        registry.markSettled(batchId);

        vm.prank(router);
        vm.expectRevert(
            abi.encodeWithSelector(
                BatchRegistry.InvalidStatusTransition.selector,
                BatchRegistry.Status.Settled,
                BatchRegistry.Status.Reverted
            )
        );
        registry.markReverted(batchId);
    }

    // ========================================================================
    // Fuzz
    // ========================================================================

    function testFuzz_BatchIdMatchesKeccakDerivation(
        address fuzzSender,
        uint256 amountSeed,
        uint8 recipientCount
    ) public {
        // Bound + filter
        recipientCount = uint8(bound(uint256(recipientCount), 1, 20));
        vm.assume(fuzzSender != address(0));
        vm.assume(fuzzSender.code.length == 0); // EOA
        vm.assume(fuzzSender != address(registry));
        vm.assume(fuzzSender != address(usdc));

        // Build distinct, valid recipients.
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](recipientCount);
        for (uint256 i; i < recipientCount; ++i) {
            rs[i] = BatchRegistry.Recipient({
                wallet: address(uint160(uint256(keccak256(abi.encode(fuzzSender, i, "wallet"))))),
                amount: bound(uint256(keccak256(abi.encode(amountSeed, i))), 1, 1_000_000e6),
                outputCurrency: BRLA
            });
            // Ensure no zero wallets sneak through.
            if (rs[i].wallet == address(0)) rs[i].wallet = makeAddr(string(abi.encodePacked("fuzz", i)));
        }

        // Fund and approve fuzzSender.
        usdc.mint(fuzzSender, 10e6);
        vm.prank(fuzzSender);
        usdc.approve(address(registry), type(uint256).max);

        bytes32 expected = _expectedBatchId(fuzzSender, rs, 0);

        vm.prank(fuzzSender);
        bytes32 actual = registry.createBatch(rs);

        assertEq(actual, expected, "batchId must match keccak derivation");
    }
}
