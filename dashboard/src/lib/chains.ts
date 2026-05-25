import { defineChain } from "viem";
import { sepolia as viemSepolia } from "viem/chains";

/** Arc Testnet (chain id 5042002). USDC is the native gas token. */
export const arcTestnet = defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
    rpcUrls: {
        default: {
            http: [process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? "https://rpc.testnet.arc.network"],
        },
    },
    blockExplorers: {
        default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
    },
    testnet: true,
});

export const sepolia = viemSepolia;
