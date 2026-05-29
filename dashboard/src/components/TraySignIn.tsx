"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

import { shortenHex } from "@/lib/format";

/**
 * TraySignIn
 *
 * Compact Privy sign-in entry rendered inline in the SystemTray, to the
 * left of the How It Works button. Mirrors the existing StartMenu
 * SignInArea logic so users have two equivalent entry points: one in
 * the Start menu (always there) and this quick-launch one in the tray.
 *
 * State:
 *   - Privy provider missing (no app id)        → component hidden
 *   - Provider present but not yet ready        → "loading…" disabled
 *   - Authenticated                              → email or short addr
 *                                                  (click to sign out)
 *   - Unauthenticated                            → "Sign in…"
 *                                                  (click → Privy modal)
 *
 * Same `.conduit-tray-link` class as HowItWorksButton, so the two
 * entries read as a coherent strip in the tray.
 */
export function TraySignIn() {
    // Privy may not be mounted (no app id). The try/catch matches the
    // existing pattern in StartMenu's SignInArea — keeping things
    // consistent with the rest of the auth surface.
    let privy: ReturnType<typeof usePrivy> | null = null;
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        privy = usePrivy();
    } catch {
        privy = null;
    }
    const { address } = useAccount();

    if (!privy) return null;
    const { ready, authenticated, user, login, logout } = privy;

    if (!ready) {
        return (
            <button
                type="button"
                className="conduit-tray-link"
                disabled
                aria-label="Sign in (loading)"
            >
                loading…
            </button>
        );
    }

    if (!authenticated) {
        return (
            <button
                type="button"
                className="conduit-tray-link"
                onClick={() => login()}
                aria-label="Sign in via Privy"
                title="Sign in via Privy (email, social, or wallet)"
            >
                Sign in…
            </button>
        );
    }

    const label =
        user?.email?.address ??
        (address
            ? shortenHex(address)
            : user?.wallet?.address
                ? shortenHex(user.wallet.address)
                : "Account");

    return (
        <button
            type="button"
            className="conduit-tray-link"
            onClick={() => logout()}
            title={`Signed in as ${label} — click to sign out`}
            aria-label={`Signed in as ${label}; click to sign out`}
        >
            {label}
        </button>
    );
}
