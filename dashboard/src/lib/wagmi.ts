"use client";

import { http } from "wagmi";
import { createConfig } from "@privy-io/wagmi";

import { arcTestnet, sepolia } from "./chains";

/**
 * Privy-flavored wagmi config. We use Privy's `createConfig` (not wagmi's)
 * so the embedded-wallet flow works alongside external connectors.
 */
export const wagmiConfig = createConfig({
    chains: [arcTestnet, sepolia],
    transports: {
        [arcTestnet.id]: http(),
        [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC),
    },
});
