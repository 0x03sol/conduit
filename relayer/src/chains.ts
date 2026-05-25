import { defineChain } from "viem";
import { sepolia as viemSepolia } from "viem/chains";

/** Sepolia (CCTP V2 source domain in v1 demo). Re-export viem's. */
export const sepolia = viemSepolia;

/**
 * Arc testnet (CCTP V2 destination domain). USDC is the native gas token.
 */
export const arcTestnet = defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
    rpcUrls: {
        default: { http: ["https://rpc.testnet.arc.network"] },
    },
    blockExplorers: {
        default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
    },
    testnet: true,
});
