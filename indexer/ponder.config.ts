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
            // Phase 4 deployment (audit-fixed: dispatcher allowlist, withdrawFees, MAX_FEE).
            address: "0x34705cF46Ddf9f3cE53f5492B6376678BE62F0fc",
            startBlock: 44463993,
        },
        BatchRouter: {
            abi: BatchRouterAbi,
            network: "arcTestnet",
            address: "0x6eD720FDF5c28cF8895A8049Fe13AF1384d82d20",
            startBlock: 44463993,
        },
    },
});
