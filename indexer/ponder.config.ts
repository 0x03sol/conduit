import { createConfig } from "ponder";
import { http } from "viem";

import { BatchRegistryAbi } from "./abis/BatchRegistry";
import { BatchRouterAbi } from "./abis/BatchRouter";

export default createConfig({
    networks: {
        arcTestnet: {
            chainId: 5042002,
            transport: http(process.env.PONDER_RPC_URL_ARC_TESTNET ?? "https://rpc.testnet.arc.network"),
        },
    },
    contracts: {
        BatchRegistry: {
            abi: BatchRegistryAbi,
            network: "arcTestnet",
            // Phase 2.3 deployment (active for the dashboard).
            address: "0x823b34D7FBa61628cE3e665F86f715e823657A17",
            startBlock: 43964622,
        },
        BatchRouter: {
            abi: BatchRouterAbi,
            network: "arcTestnet",
            address: "0x1a8F8B0aA5fe50c3c9B48E5aCA56aBe2CE52452f",
            startBlock: 43964624,
        },
    },
});
