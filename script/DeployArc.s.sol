// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BatchRegistry} from "../src/BatchRegistry.sol";
import {BatchRouter} from "../src/BatchRouter.sol";

/// @title DeployArc
/// @notice Deploys Conduit v1 contracts (`BatchRegistry`, `BatchRouter`) on
///         Arc testnet (chain id 5042002), wires `setRouter`, and persists
///         the resulting addresses to `deployments/arc-testnet.json`.
///
/// @dev Usage (dry-run simulation, no broadcast):
///        forge script script/DeployArc.s.sol \
///          --rpc-url arc_testnet \
///          --sender $DEPLOYER_ADDR
///
///      Real broadcast:
///        forge script script/DeployArc.s.sol \
///          --rpc-url arc_testnet \
///          --private-key $DEPLOYER_PK \
///          --broadcast \
///          --slow \
///          -vvvv
///
///      Optional env vars:
///        REGISTRATION_FEE   USDC base units charged at createBatch (default 1_000_000 = 1 USDC)
///
/// @dev Per memory.md GO-005 we re-verify ARC_USDC against
///      docs.arc.io/arc/references/contract-addresses on every deploy day.
contract DeployArc is Script {
    // ────────────── Verified Arc constants (re-verify before every deploy) ──────────────

    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    // ────────────── Errors ──────────────

    error WrongChain(uint256 got, uint256 expected);

    // ────────────── Run ──────────────

    function run() external {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert WrongChain(block.chainid, ARC_TESTNET_CHAIN_ID);
        }

        uint256 registrationFee = vm.envOr("REGISTRATION_FEE", uint256(1_000_000)); // 1 USDC
        address deployer = msg.sender;

        // ────────── Pre-flight diagnostics (no state change) ──────────
        console2.log("==================================================");
        console2.log("Conduit v1 deploy - Arc testnet");
        console2.log("==================================================");
        console2.log("Chain ID:           ", block.chainid);
        console2.log("Deployer:           ", deployer);
        // Note: on Arc, native gas is USDC (6 decimals). Both `address.balance`
        // and the ERC20 `balanceOf` view should agree. We print both as a
        // sanity check that the chain is configured the way we think.
        console2.log("Deployer USDC bal:  ", IERC20(ARC_USDC).balanceOf(deployer));
        console2.log("USDC contract:      ", ARC_USDC);
        console2.log("Registration fee:   ", registrationFee);
        console2.log("--------------------------------------------------");

        // ────────── Broadcast ──────────
        vm.startBroadcast();

        BatchRegistry registry = new BatchRegistry(ARC_USDC, registrationFee);
        BatchRouter router = new BatchRouter(
            address(registry),
            ARC_USDC,
            bytes32(0),    // fxTicker = 0 disables FX corridor
            address(0),    // fxToken
            address(0)     // fxAdapter
        );
        registry.setRouter(address(router));

        vm.stopBroadcast();

        // ────────── Post-deploy log ──────────
        console2.log("Deployed contracts:");
        console2.log("  BatchRegistry:     ", address(registry));
        console2.log("  BatchRouter:       ", address(router));
        console2.log("");
        console2.log("Owner of registry:  ", registry.owner());
        console2.log("Wired router addr:  ", registry.router());
        console2.log("==================================================");

        // ────────── Persist artifact ──────────
        // Keys ordered to match what dashboard + indexer config expect.
        // `commitHash` is left as a TODO — populated by post-deploy script
        // that reads `git rev-parse HEAD` (avoids embedding shell calls here).
        string memory json = string.concat(
            "{\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "deployedAt": ', vm.toString(block.timestamp), ",\n",
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "usdc": "', vm.toString(ARC_USDC), '",\n',
            '  "registrationFee": ', vm.toString(registrationFee), ",\n",
            '  "contracts": {\n',
            '    "BatchRegistry": "', vm.toString(address(registry)), '",\n',
            '    "BatchRouter": "', vm.toString(address(router)), '"\n',
            "  }\n",
            "}\n"
        );
        vm.writeFile("./deployments/arc-testnet.json", json);
        console2.log("Wrote deployments/arc-testnet.json");
    }
}
