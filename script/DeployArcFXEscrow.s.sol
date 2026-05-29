// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {BatchRegistry} from "../src/BatchRegistry.sol";
import {BatchRouter} from "../src/BatchRouter.sol";
import {FxEscrowAdapter} from "../src/FxEscrowAdapter.sol";
import {MockFxEscrow} from "../src/MockFxEscrow.sol";

/// @title DeployArcFXEscrow
/// @notice Deploys the Phase 2.3.5 stack on Arc testnet:
///         MockFxEscrow + FxEscrowAdapter + new BatchRegistry + new BatchRouter
///         (FX corridor pointing at FxEscrowAdapter).
///
///         Phase 2.3 (MockFxAdapter) and Phase 1.3 (FX-disabled) deployments
///         remain on chain as historical references.
///
/// @dev Per GO-009 this script does NO token transfers; only contract deploys
///      + admin calls (setMakerAllowed, setRouter). The maker (deployer) must
///      separately approve `MockFxEscrow` to pull EURC via
///      `script/approve-fx-escrow-arc.sh`.
///
/// @dev Usage:
///        forge script script/DeployArcFXEscrow.s.sol \
///          --rpc-url arc_testnet --private-key $DEPLOYER_PK \
///          --broadcast --slow -vvvv
///
///      Optional env override:
///        REGISTRATION_FEE  USDC base units (default 1e6 = 1 USDC)
contract DeployArcFXEscrow is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    // Ticker is a 4-char ASCII string fitting comfortably in bytes32; cast is safe.
    // forge-lint: disable-next-line(unsafe-typecast)
    bytes32 internal constant EURC_TICKER = bytes32("EURC");

    error WrongChain(uint256 got, uint256 expected);

    function run() external {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert WrongChain(block.chainid, ARC_TESTNET_CHAIN_ID);
        }

        uint256 registrationFee = vm.envOr("REGISTRATION_FEE", uint256(1_000_000));
        address deployer = msg.sender;

        console2.log("==================================================");
        console2.log("Conduit v1 + FxEscrowAdapter deploy [Phase 2.3.5]");
        console2.log("==================================================");
        console2.log("Chain ID:           ", block.chainid);
        console2.log("Deployer/maker:     ", deployer);
        console2.log("USDC:               ", ARC_USDC);
        console2.log("EURC:               ", ARC_EURC);
        console2.log("Registration fee:   ", registrationFee);
        console2.log("--------------------------------------------------");

        vm.startBroadcast();

        // 1. MockFxEscrow — handles atomic PvP between adapter and maker.
        MockFxEscrow escrow = new MockFxEscrow();

        // 2. FxEscrowAdapter — production adapter, EIP-712 quote verification.
        FxEscrowAdapter adapter = new FxEscrowAdapter(ARC_USDC, address(escrow));

        // 3. Allowlist deployer as the maker.
        adapter.setMakerAllowed(deployer, true);

        // 4. New BatchRegistry.
        BatchRegistry registry = new BatchRegistry(ARC_USDC, registrationFee);

        // 5. New BatchRouter with FX corridor → FxEscrowAdapter.
        BatchRouter router = new BatchRouter(
            address(registry),
            ARC_USDC,
            EURC_TICKER,
            ARC_EURC,
            address(adapter)
        );

        // 6. Wire registry → router.
        registry.setRouter(address(router));

        vm.stopBroadcast();

        console2.log("Deployed:");
        console2.log("  MockFxEscrow:       ", address(escrow));
        console2.log("  FxEscrowAdapter:    ", address(adapter));
        console2.log("  BatchRegistry:      ", address(registry));
        console2.log("  BatchRouter:        ", address(router));
        console2.log("");
        console2.log("Wired:");
        console2.log("  adapter.escrow      ", address(adapter.escrow()));
        console2.log("  adapter.usdc        ", address(adapter.usdc()));
        console2.log("  adapter.allowedMaker(deployer)", adapter.allowedMaker(deployer));
        console2.log("  adapter.owner       ", adapter.owner());
        console2.log("  router.fxAdapter    ", address(router.fxAdapter()));
        console2.log("  registry.router     ", registry.router());
        console2.log("==================================================");

        // Persist artifact (incremental concat to dodge Yul stack-too-deep).
        string memory j = "{\n";
        j = string.concat(j, '  "chainId": ', vm.toString(block.chainid), ",\n");
        j = string.concat(j, '  "deployedAt": ', vm.toString(block.timestamp), ",\n");
        j = string.concat(j, '  "deployer": "', vm.toString(deployer), '",\n');
        j = string.concat(j, '  "usdc": "', vm.toString(ARC_USDC), '",\n');
        j = string.concat(j, '  "registrationFee": ', vm.toString(registrationFee), ",\n");
        j = string.concat(j, '  "fx": {\n');
        j = string.concat(j, '    "ticker": "EURC",\n');
        j = string.concat(j, '    "token": "', vm.toString(ARC_EURC), '",\n');
        j = string.concat(j, '    "adapterKind": "FxEscrowAdapter",\n');
        j = string.concat(j, '    "maker": "', vm.toString(deployer), '"\n');
        j = string.concat(j, "  },\n");
        j = string.concat(j, '  "contracts": {\n');
        j = string.concat(j, '    "MockFxEscrow": "', vm.toString(address(escrow)), '",\n');
        j = string.concat(j, '    "FxEscrowAdapter": "', vm.toString(address(adapter)), '",\n');
        j = string.concat(j, '    "BatchRegistry": "', vm.toString(address(registry)), '",\n');
        j = string.concat(j, '    "BatchRouter": "', vm.toString(address(router)), '"\n');
        j = string.concat(j, "  }\n");
        j = string.concat(j, "}\n");
        vm.writeFile("./deployments/arc-testnet-fx-escrow.json", j);
        console2.log("Wrote deployments/arc-testnet-fx-escrow.json");
        console2.log("");
        console2.log("NEXT STEPS:");
        console2.log("  1. bash script/approve-fx-escrow-arc.sh   # maker approves escrow for EURC");
        console2.log("  2. bash script/smoke-test-fx-escrow-arc.sh # full lifecycle");
    }
}
