// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {CCTPHookReceiver} from "../src/CCTPHookReceiver.sol";

/// @title DeployCCTPHookReceiverArc
/// @notice Deploys CCTPHookReceiver on Arc testnet, wired to:
///         - MessageTransmitterV2 = 0xE737e5cE... (verified Arc CCTP V2)
///         - USDC                 = 0x3600... (Arc native gas USDC)
///         - BatchRouter (FX-enabled, Phase 2.3) = 0x1a8F8B0a...
///         The receiver supports BOTH the manual `processHook` flow used by
///         the Iris relayer for CCTP V2 token transfers, AND the auto-called
///         `IMessageHandlerV2` interface for direct sendMessage flows.
/// @dev    After this deploy, the operator must call:
///           cast send <receiver> 'setTrustedRemoteSender(uint32,bytes32)' \
///             0 0x0000000000000000000000008FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA \
///             ...
///         (Sepolia domain = 0; sender = TokenMessengerV2 on Sepolia, padded.)
contract DeployCCTPHookReceiverArc is Script {
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant ARC_MESSAGE_TRANSMITTER = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;
    address internal constant PHASE_2_3_ROUTER = 0x1a8F8B0aA5fe50c3c9B48E5aCA56aBe2CE52452f;

    error WrongChain(uint256 got, uint256 expected);

    function run() external {
        if (block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert WrongChain(block.chainid, ARC_TESTNET_CHAIN_ID);
        }

        address deployer = msg.sender;

        console2.log("==================================================");
        console2.log("Deploy CCTPHookReceiver on Arc testnet [Phase 3.2.3]");
        console2.log("==================================================");
        console2.log("Chain ID:               ", block.chainid);
        console2.log("Deployer/owner:         ", deployer);
        console2.log("MessageTransmitterV2:   ", ARC_MESSAGE_TRANSMITTER);
        console2.log("USDC:                   ", ARC_USDC);
        console2.log("BatchRouter (Phase 2.3):", PHASE_2_3_ROUTER);
        console2.log("--------------------------------------------------");

        vm.startBroadcast();
        CCTPHookReceiver receiver = new CCTPHookReceiver(
            ARC_MESSAGE_TRANSMITTER,
            ARC_USDC,
            PHASE_2_3_ROUTER
        );
        vm.stopBroadcast();

        console2.log("Deployed:");
        console2.log("  CCTPHookReceiver: ", address(receiver));
        console2.log("");

        // Persist artifact.
        string memory j = "{\n";
        j = string.concat(j, '  "chainId": ', vm.toString(block.chainid), ",\n");
        j = string.concat(j, '  "deployedAt": ', vm.toString(block.timestamp), ",\n");
        j = string.concat(j, '  "deployer": "', vm.toString(deployer), '",\n');
        j = string.concat(j, '  "messageTransmitter": "', vm.toString(ARC_MESSAGE_TRANSMITTER), '",\n');
        j = string.concat(j, '  "usdc": "', vm.toString(ARC_USDC), '",\n');
        j = string.concat(j, '  "router": "', vm.toString(PHASE_2_3_ROUTER), '",\n');
        j = string.concat(j, '  "receiver": "', vm.toString(address(receiver)), '"\n');
        j = string.concat(j, "}\n");
        vm.writeFile("./deployments/arc-testnet-cctp-receiver.json", j);
        console2.log("Wrote deployments/arc-testnet-cctp-receiver.json");
    }
}
