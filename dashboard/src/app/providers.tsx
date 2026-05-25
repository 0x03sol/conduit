"use client";

import { useState } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { wagmiConfig } from "@/lib/wagmi";
import { arcTestnet } from "@/lib/chains";

export function Providers({ children }: { children: React.ReactNode }) {
    const [qc] = useState(() => new QueryClient({
        defaultOptions: {
            queries: { staleTime: 5_000, refetchOnWindowFocus: false },
        },
    }));

    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    if (!appId) {
        // Render the app without auth so dev work can proceed without
        // configuring Privy. Sender / write paths will fail gracefully when
        // a wallet is not connected.
        return (
            <QueryClientProvider client={qc}>
                <WagmiProvider config={wagmiConfig}>
                    <div className="bg-yellow-50 border-b border-yellow-300 px-4 py-2 text-xs text-yellow-900">
                        NEXT_PUBLIC_PRIVY_APP_ID is not set. Login + write flows are disabled. Read views still work.
                    </div>
                    {children}
                </WagmiProvider>
            </QueryClientProvider>
        );
    }

    return (
        <PrivyProvider
            appId={appId}
            config={{
                loginMethods: ["email", "wallet"],
                embeddedWallets: {
                    createOnLogin: "users-without-wallets",
                    requireUserPasswordOnCreate: false,
                },
                defaultChain: arcTestnet,
                supportedChains: [arcTestnet],
                appearance: {
                    theme: "light",
                    accentColor: "#0066ff",
                    logo: "https://testnet.arcscan.app/favicon.ico",
                },
            }}
        >
            <QueryClientProvider client={qc}>
                <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
            </QueryClientProvider>
        </PrivyProvider>
    );
}
