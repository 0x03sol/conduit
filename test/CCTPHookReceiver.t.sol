// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {BatchRegistry} from "../src/BatchRegistry.sol";
import {BatchRouter} from "../src/BatchRouter.sol";
import {MockFxAdapter} from "../src/MockFxAdapter.sol";
import {CCTPHookReceiver} from "../src/CCTPHookReceiver.sol";
import {IMessageHandlerV2} from "../src/interfaces/IMessageHandlerV2.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract MockBRLA is ERC20 {
    constructor() ERC20("Brazilian Real Aprov.", "BRLA") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract CCTPHookReceiverTest is Test {
    BatchRegistry public registry;
    BatchRouter public router;
    CCTPHookReceiver public receiver;
    MockUSDC public usdc;

    /// @dev `messageTransmitter` is just a labelled address — we never deploy
    ///      a real transmitter; we only need `vm.prank(messageTransmitter)`
    ///      to gate the receiver's hook methods.
    address public messageTransmitter = makeAddr("messageTransmitter");
    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    /// @dev Source-domain identifier (Sepolia in real life). Just a label here.
    uint32 public constant SRC_DOMAIN = 0;
    /// @dev Trusted source-chain `TokenMessengerV2` (or our own contract) cast to bytes32.
    bytes32 public constant TRUSTED_SENDER = bytes32(uint256(uint160(0x1111111111111111111111111111111111111111)));

    bytes32 public constant USDC_TICKER = bytes32("USDC");
    uint256 public constant FEE = 1e6;

    event TrustedRemoteSenderSet(uint32 indexed srcDomain, bytes32 indexed sender);
    event Swept(address indexed token, address indexed to, uint256 amount);
    event MessageHandled(
        uint32 indexed sourceDomain,
        bytes32 indexed sender,
        bytes32 indexed batchId,
        uint256 fundedAmount
    );

    function setUp() public {
        usdc = new MockUSDC();

        vm.prank(owner);
        registry = new BatchRegistry(address(usdc), FEE);

        // FX-disabled router for the bulk of tests; FX-corridor tests redeploy.
        router = new BatchRouter(address(registry), address(usdc), bytes32(0), address(0), address(0));
        vm.prank(owner);
        registry.setRouter(address(router));

        vm.prank(owner);
        receiver = new CCTPHookReceiver(messageTransmitter, address(usdc), address(router));

        vm.prank(owner);
        receiver.setTrustedRemoteSender(SRC_DOMAIN, TRUSTED_SENDER);
    }

    // ─────────────────── Helpers ───────────────────

    function _createUsdcBatch() internal returns (bytes32 batchId, uint256 totalNeeded) {
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](2);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e6, outputCurrency: USDC_TICKER});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 50e6, outputCurrency: USDC_TICKER});

        // Sender is the receiver's "originating" actor. For tests, mint USDC to
        // a separate "sender" address so the registry fee mechanic still works.
        address sender = makeAddr("batchSender");
        usdc.mint(sender, FEE);
        vm.prank(sender);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(sender);
        batchId = registry.createBatch(rs);
        totalNeeded = 150e6;
    }

    function _hookData(bytes32 batchId) internal pure returns (bytes memory) {
        return abi.encode(batchId, uint16(50), "");
    }

    // ========================================================================
    // Constructor
    // ========================================================================

    function test_Constructor_StoresImmutables() public view {
        assertEq(receiver.messageTransmitter(), messageTransmitter);
        assertEq(address(receiver.usdc()), address(usdc));
        assertEq(address(receiver.router()), address(router));
        assertEq(receiver.owner(), owner);
    }

    function test_Constructor_RevertWhen_MessageTransmitterIsZero() public {
        vm.expectRevert(CCTPHookReceiver.ZeroAddress.selector);
        new CCTPHookReceiver(address(0), address(usdc), address(router));
    }

    function test_Constructor_RevertWhen_USDCIsZero() public {
        vm.expectRevert(CCTPHookReceiver.ZeroAddress.selector);
        new CCTPHookReceiver(messageTransmitter, address(0), address(router));
    }

    function test_Constructor_RevertWhen_RouterIsZero() public {
        vm.expectRevert(CCTPHookReceiver.ZeroAddress.selector);
        new CCTPHookReceiver(messageTransmitter, address(usdc), address(0));
    }

    // ========================================================================
    // setTrustedRemoteSender
    // ========================================================================

    function test_SetTrustedRemoteSender_RevertWhen_NotOwner() public {
        vm.prank(makeAddr("eve"));
        vm.expectRevert(CCTPHookReceiver.NotOwner.selector);
        receiver.setTrustedRemoteSender(1, TRUSTED_SENDER);
    }

    function test_SetTrustedRemoteSender_HappyPath_StoresAndEmits() public {
        bytes32 newSender = bytes32(uint256(0xAB));
        vm.expectEmit(true, true, false, false, address(receiver));
        emit TrustedRemoteSenderSet(7, newSender);
        vm.prank(owner);
        receiver.setTrustedRemoteSender(7, newSender);
        assertEq(receiver.trustedRemoteSenders(7), newSender);
    }

    function test_SetTrustedRemoteSender_AllowsUnsetByZero() public {
        vm.prank(owner);
        receiver.setTrustedRemoteSender(SRC_DOMAIN, bytes32(0));
        assertEq(receiver.trustedRemoteSenders(SRC_DOMAIN), bytes32(0));
    }

    // ========================================================================
    // handleReceiveFinalizedMessage — revert paths
    // ========================================================================

    function test_HandleFinalized_RevertWhen_NotMessageTransmitter() public {
        (bytes32 batchId,) = _createUsdcBatch();
        vm.prank(makeAddr("notTransmitter"));
        vm.expectRevert(CCTPHookReceiver.NotMessageTransmitter.selector);
        receiver.handleReceiveFinalizedMessage(SRC_DOMAIN, TRUSTED_SENDER, 2000, _hookData(batchId));
    }

    function test_HandleFinalized_RevertWhen_UntrustedSourceDomain() public {
        (bytes32 batchId,) = _createUsdcBatch();
        vm.prank(messageTransmitter);
        vm.expectRevert(
            abi.encodeWithSelector(CCTPHookReceiver.UntrustedRemoteSender.selector, uint32(99), TRUSTED_SENDER)
        );
        receiver.handleReceiveFinalizedMessage(99, TRUSTED_SENDER, 2000, _hookData(batchId));
    }

    function test_HandleFinalized_RevertWhen_UntrustedSender() public {
        (bytes32 batchId,) = _createUsdcBatch();
        bytes32 wrongSender = bytes32(uint256(0xBAD));
        vm.prank(messageTransmitter);
        vm.expectRevert(
            abi.encodeWithSelector(CCTPHookReceiver.UntrustedRemoteSender.selector, SRC_DOMAIN, wrongSender)
        );
        receiver.handleReceiveFinalizedMessage(SRC_DOMAIN, wrongSender, 2000, _hookData(batchId));
    }

    function test_HandleFinalized_RevertWhen_NoFunding() public {
        // Receiver has 0 USDC; nothing was minted. Should revert NoFunding.
        (bytes32 batchId,) = _createUsdcBatch();
        vm.prank(messageTransmitter);
        vm.expectRevert(CCTPHookReceiver.NoFunding.selector);
        receiver.handleReceiveFinalizedMessage(SRC_DOMAIN, TRUSTED_SENDER, 2000, _hookData(batchId));
    }

    function test_HandleFinalized_RevertWhen_MalformedHookData() public {
        // Simulate post-mint USDC.
        usdc.mint(address(receiver), 200e6);

        // Empty bytes → abi.decode reverts. Not a custom error from the receiver.
        vm.prank(messageTransmitter);
        vm.expectRevert();
        receiver.handleReceiveFinalizedMessage(SRC_DOMAIN, TRUSTED_SENDER, 2000, "");
    }

    // ========================================================================
    // handleReceiveFinalizedMessage — happy path
    // ========================================================================

    function test_HandleFinalized_HappyPath_USDCCorridor_DistributesAndReturnsTrue() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();

        // Simulate post-mint: receiver has exactly the totalNeeded USDC.
        usdc.mint(address(receiver), totalNeeded);

        vm.prank(messageTransmitter);
        bool ok = receiver.handleReceiveFinalizedMessage(
            SRC_DOMAIN, TRUSTED_SENDER, 2000, _hookData(batchId)
        );
        assertTrue(ok);

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 50e6);
        assertEq(usdc.balanceOf(address(receiver)), 0, "receiver must drain to router");
        assertEq(usdc.balanceOf(address(router)), 0, "router must not retain");
    }

    function test_HandleFinalized_HappyPath_OverFunded_LeavesResidualOnReceiver() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();

        // Mint more than totalNeeded — router will refund excess to msg.sender (= receiver).
        usdc.mint(address(receiver), totalNeeded + 7e6);

        vm.prank(messageTransmitter);
        receiver.handleReceiveFinalizedMessage(SRC_DOMAIN, TRUSTED_SENDER, 2000, _hookData(batchId));

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 50e6);
        assertEq(usdc.balanceOf(address(receiver)), 7e6, "excess stays on receiver until sweep");
    }

    function test_HandleFinalized_HappyPath_EmitsMessageHandled() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        usdc.mint(address(receiver), totalNeeded);

        vm.expectEmit(true, true, true, true, address(receiver));
        emit MessageHandled(SRC_DOMAIN, TRUSTED_SENDER, batchId, totalNeeded);

        vm.prank(messageTransmitter);
        receiver.handleReceiveFinalizedMessage(SRC_DOMAIN, TRUSTED_SENDER, 2000, _hookData(batchId));
    }

    // ========================================================================
    // handleReceiveUnfinalizedMessage — same path as finalized
    // ========================================================================

    function test_HandleUnfinalized_HappyPath_DelegatesToSameLogic() public {
        (bytes32 batchId, uint256 totalNeeded) = _createUsdcBatch();
        usdc.mint(address(receiver), totalNeeded);

        vm.prank(messageTransmitter);
        bool ok = receiver.handleReceiveUnfinalizedMessage(
            SRC_DOMAIN, TRUSTED_SENDER, 1000, _hookData(batchId)
        );
        assertTrue(ok);

        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(bob), 50e6);
    }

    function test_HandleUnfinalized_RevertWhen_NotMessageTransmitter() public {
        (bytes32 batchId,) = _createUsdcBatch();
        vm.prank(makeAddr("notTransmitter"));
        vm.expectRevert(CCTPHookReceiver.NotMessageTransmitter.selector);
        receiver.handleReceiveUnfinalizedMessage(SRC_DOMAIN, TRUSTED_SENDER, 1000, _hookData(batchId));
    }

    // ========================================================================
    // FX corridor via hook
    // ========================================================================

    function test_HandleFinalized_FXCorridor_DistributesBRLA() public {
        // Build an FX-enabled stack from scratch.
        MockBRLA brla = new MockBRLA();
        MockFxAdapter adapter = new MockFxAdapter(address(usdc));
        adapter.setRate(address(brla), 5e18); // 1 USDC = 5 BRLA
        brla.mint(address(adapter), 10_000e18);

        vm.prank(owner);
        BatchRegistry fxRegistry = new BatchRegistry(address(usdc), FEE);
        BatchRouter fxRouter = new BatchRouter(
            address(fxRegistry),
            address(usdc),
            bytes32("BRLA"),
            address(brla),
            address(adapter)
        );
        vm.prank(owner);
        fxRegistry.setRouter(address(fxRouter));

        vm.prank(owner);
        CCTPHookReceiver fxReceiver = new CCTPHookReceiver(
            messageTransmitter,
            address(usdc),
            address(fxRouter)
        );
        vm.prank(owner);
        fxReceiver.setTrustedRemoteSender(SRC_DOMAIN, TRUSTED_SENDER);

        // Build a BRLA batch.
        BatchRegistry.Recipient[] memory rs = new BatchRegistry.Recipient[](2);
        rs[0] = BatchRegistry.Recipient({wallet: alice, amount: 100e18, outputCurrency: bytes32("BRLA")});
        rs[1] = BatchRegistry.Recipient({wallet: bob, amount: 250e18, outputCurrency: bytes32("BRLA")});
        // 350 BRLA total → fundedAmount = 70 USDC at 5 BRLA/USDC.
        address fxSender = makeAddr("fxBatchSender");
        usdc.mint(fxSender, FEE);
        vm.prank(fxSender);
        usdc.approve(address(fxRegistry), type(uint256).max);
        vm.prank(fxSender);
        bytes32 batchId = fxRegistry.createBatch(rs);

        // Simulate post-mint: 70 USDC arrived at the receiver.
        usdc.mint(address(fxReceiver), 70e6);

        vm.prank(messageTransmitter);
        bool ok = fxReceiver.handleReceiveFinalizedMessage(
            SRC_DOMAIN, TRUSTED_SENDER, 2000, _hookData(batchId)
        );
        assertTrue(ok);

        assertEq(brla.balanceOf(alice), 100e18);
        assertEq(brla.balanceOf(bob), 250e18);
        assertEq(usdc.balanceOf(address(fxReceiver)), 0);
        assertEq(usdc.balanceOf(address(adapter)), 70e6);
    }

    // ========================================================================
    // sweep
    // ========================================================================

    function test_Sweep_RevertWhen_NotOwner() public {
        usdc.mint(address(receiver), 5e6);
        vm.prank(makeAddr("eve"));
        vm.expectRevert(CCTPHookReceiver.NotOwner.selector);
        receiver.sweep(address(usdc), makeAddr("anywhere"), 5e6);
    }

    function test_Sweep_HappyPath_USDC() public {
        usdc.mint(address(receiver), 5e6);
        address dest = makeAddr("treasury");
        vm.expectEmit(true, true, false, true, address(receiver));
        emit Swept(address(usdc), dest, 5e6);

        vm.prank(owner);
        receiver.sweep(address(usdc), dest, 5e6);

        assertEq(usdc.balanceOf(dest), 5e6);
        assertEq(usdc.balanceOf(address(receiver)), 0);
    }

    function test_Sweep_HappyPath_OtherToken() public {
        MockBRLA brla = new MockBRLA();
        brla.mint(address(receiver), 7e18);
        address dest = makeAddr("treasury2");

        vm.prank(owner);
        receiver.sweep(address(brla), dest, 7e18);

        assertEq(brla.balanceOf(dest), 7e18);
    }
}
