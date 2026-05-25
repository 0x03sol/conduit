"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

import { shortenHex } from "@/lib/format";

export function LoginButton() {
    // Best-effort: usePrivy throws if PrivyProvider isn't mounted (e.g. when
    // NEXT_PUBLIC_PRIVY_APP_ID is unset). The provider's fallback wraps the
    // app without it; in that case we just render a placeholder.
    let privyState: ReturnType<typeof usePrivy> | null = null;
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        privyState = usePrivy();
    } catch {
        privyState = null;
    }
    const { address } = useAccount();

    if (!privyState) {
        return (
            <span className="text-xs text-ink-soft/70 font-mono">no Privy app id</span>
        );
    }

    const { ready, authenticated, user, login, logout } = privyState;

    if (!ready) {
        return <span className="text-xs text-ink-soft/70">loading…</span>;
    }

    if (!authenticated) {
        return (
            <button
                onClick={login}
                className="px-3 py-1.5 text-sm bg-ink text-paper rounded hover:bg-ink-soft whitespace-nowrap"
            >
                Sign in
            </button>
        );
    }

    const label =
        user?.email?.address ??
        (address ? shortenHex(address) : user?.wallet?.address ? shortenHex(user.wallet.address) : "Account");

    return (
        <div className="flex items-center gap-2 text-sm whitespace-nowrap">
            <span className="font-mono">{label}</span>
            <button onClick={logout} className="px-2 py-1 text-xs border border-border rounded hover:border-signal whitespace-nowrap">
                Sign out
            </button>
        </div>
    );
}
