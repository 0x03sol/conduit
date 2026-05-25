// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BatchRegistry} from "../src/BatchRegistry.sol";
import {BatchRouter} from "../src/BatchRouter.sol";
import {MockFxAdapter} from "../src/MockFxAdapter.sol";

/// @title DeployArcFX
/// @notice Deploys Conduit v1 with FX corridor (USDC ↔ EURC) on Arc testnet.
///         Replaces the FX-disabled deployment from Phase 1.3 with new
///         contracts at new addresses; the previous deployment remains on
///         chain as deprecated.
///
/// @dev Usage (dry-run):
///        forge script script/DeployArcFX.s.sol \
///          --rpc-url arc_testnet --sender $DEPLOYER_ADDR -vv
///
///      Real broadcast:
///        forge script script/DeployArcFX.s.sol \
///          --rpc-url arc_testnet --private-key $DEPLOYER_PK \
///          --broadcast --slow -vvvv
///
///      Optional env overrides:
///        REGISTRATION_FEE       USDC base units charged at createBatch (default 1e6 = 1 USDC)
///        FX_RATE_USDC_TO_EURC   MockFxAdapter rate, scaled by 1e6 (default 1e6 = 1:1)
///
/// @dev Per GO-009 in memory.md, this script must NOT touch USDC/EURC
///      balances (Arc's blocklist precompile breaks local simulation).
///      Funding the adapter happens separately via `script/fund-fx-adapter-arc.sh`.
contract DeployArcFX is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    bytes32 internal constant EURC_TICKER = bytes32("EURC");

    error WrongChain(uint256 got, uint256 expected);

    function run() external {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert WrongChain(block.chainid, ARC_TESTNET_CHAIN_ID);
        }

        uint256 registrationFee = vm.envOr("REGISTRATION_FEE", uint256(1_000_000));
        uint256 fxRate = vm.envOr("FX_RATE_USDC_TO_EURC", uint256(1_000_000)); // 1:1
        address deployer = msg.sender;

        // Pre-flight diagnostic.
        console2.log("==================================================");
        console2.log("Conduit v1 + FX deploy - Arc testnet");
        console2.log("==================================================");
        console2.log("Chain ID:               ", block.chainid);
        console2.log("Deployer:               ", deployer);
        console2.log("USDC contract:          ", ARC_USDC);
        console2.log("EURC contract:          ", ARC_EURC);
        console2.log("FX ticker:              EURC");
        console2.log("FX rate (1e6 scaled):   ", fxRate);
        console2.log("Registration fee:       ", registrationFee);
        console2.log("--------------------------------------------------");

        // Broadcast.
        vm.startBroadcast();

        // 1. Deploy MockFxAdapter with USDC as the input.
        MockFxAdapter adapter = new MockFxAdapter(ARC_USDC);
        // 2. Configure deterministic rate for EURC.
        adapter.setRate(ARC_EURC, fxRate);

        // 3. Deploy BatchRegistry.
        BatchRegistry registry = new BatchRegistry(ARC_USDC, registrationFee);

        // 4. Deploy BatchRouter with FX corridor enabled (EURC).
        BatchRouter router = new BatchRouter(
            address(registry),
            ARC_USDC,
            EURC_TICKER,
            ARC_EURC,
            address(adapter)
        );

        // 5. Wire registry → router.
        registry.setRouter(address(router));

        vm.stopBroadcast();

        // Post-deploy diagnostics.
        console2.log("Deployed:");
        console2.log("  MockFxAdapter:        ", address(adapter));
        console2.log("  BatchRegistry:        ", address(registry));
        console2.log("  BatchRouter:          ", address(router));
        console2.log("");
        console2.log("Wired:");
        console2.log("  registry.router       ", registry.router());
        console2.log("  router.fxTicker       ", vm.toString(router.fxTicker()));
        console2.log("  router.fxToken        ", address(router.fxToken()));
        console2.log("  router.fxAdapter      ", address(router.fxAdapter()));
        console2.log("==================================================");

        // Persist artifact (separate file so Phase 1.3 deployment is not overwritten).
        // Built incrementally to avoid Yul stack-too-deep with via_ir.
        string memory json = "{\n";
        json = string.concat(json, '  "chainId": ', vm.toString(block.chainid), ",\n");
        json = string.concat(json, '  "deployedAt": ', vm.toString(block.timestamp), ",\n");
        json = string.concat(json, '  "deployer": "', vm.toString(deployer), '",\n');
        json = string.concat(json, '  "usdc": "', vm.toString(ARC_USDC), '",\n');
        json = string.concat(json, '  "registrationFee": ', vm.toString(registrationFee), ",\n");
        json = string.concat(json, '  "fx": {\n');
        json = string.concat(json, '    "ticker": "EURC",\n');
        json = string.concat(json, '    "token": "', vm.toString(ARC_EURC), '",\n');
        json = string.concat(json, '    "rate1e6": ', vm.toString(fxRate), "\n");
        json = string.concat(json, "  },\n");
        json = string.concat(json, '  "contracts": {\n');
        json = string.concat(json, '    "BatchRegistry": "', vm.toString(address(registry)), '",\n');
        json = string.concat(json, '    "BatchRouter": "', vm.toString(address(router)), '",\n');
        json = string.concat(json, '    "MockFxAdapter": "', vm.toString(address(adapter)), '"\n');
        json = string.concat(json, "  }\n");
        json = string.concat(json, "}\n");
        vm.writeFile("./deployments/arc-testnet-fx.json", json);
        console2.log("Wrote deployments/arc-testnet-fx.json");
        console2.log("");
        console2.log("NEXT STEP: fund MockFxAdapter with EURC reserves.");
        console2.log("  bash script/fund-fx-adapter-arc.sh");
    }
}
