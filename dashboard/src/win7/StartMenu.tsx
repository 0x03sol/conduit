"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

import { useDesktop } from "./store";
import { Icon, type IconKey } from "./icons";
import { Win7Flag } from "./Win7Flag";
import { APPS } from "./apps/registry";
import { shortenHex } from "@/lib/format";

export function StartMenu() {
    const open = useDesktop((s) => s.startMenuOpen);
    const close = useDesktop((s) => s.closeStartMenu);
    const openApp = useDesktop((s) => s.openApp);

    if (!open) return null;

    function launch(id: string, title: string) {
        openApp(id, { title });
        close();
    }

    return (
        <>
            <div
                onClick={close}
                style={{ position: "fixed", inset: 0, zIndex: 9000, background: "transparent" }}
            />
            <div
                role="menu"
                className="w7-start-menu"
                onClick={(e) => e.stopPropagation()}
            >
                {/* User pane top */}
                <div
                    style={{
                        background: "linear-gradient(180deg, #f7fbff 0%, #d4e4f8 100%)",
                        borderBottom: "1px solid rgba(0, 30, 80, 0.25)",
                        padding: "8px 10px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                    }}
                >
                    <div
                        style={{
                            width: "36px",
                            height: "36px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Win7Flag size={28} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: "bold", fontSize: "13px" }}>Conduit</span>
                        <span style={{ fontSize: "11px", color: "#445" }}>
                            Cross-chain settlement on Arc
                        </span>
                    </div>
                </div>

                {/* App list */}
                <ul className="w7-start-menu-list">
                    {Object.values(APPS)
                        .filter((a) => !a.hidden)
                        .map((app) => (
                            <MenuItem
                                key={app.id}
                                icon={app.icon}
                                label={app.title}
                                onClick={() => launch(app.id, app.title)}
                            />
                        ))}
                </ul>

                {/* Footer with account */}
                <div className="w7-start-menu-footer">
                    <SignInArea onAfterAction={close} />
                </div>
            </div>
        </>
    );
}

function MenuItem({ icon, label, onClick }: { icon: IconKey; label: string; onClick: () => void }) {
    return (
        <li>
            <button type="button" onClick={onClick}>
                <Icon icon={icon} size={20} />
                <span>{label}</span>
            </button>
        </li>
    );
}

function SignInArea({ onAfterAction }: { onAfterAction: () => void }) {
    let privyState: ReturnType<typeof usePrivy> | null = null;
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        privyState = usePrivy();
    } catch {
        privyState = null;
    }
    const { address } = useAccount();

    if (!privyState) {
        return <span style={{ fontSize: "11px", color: "#666" }}>Privy not configured</span>;
    }
    const { ready, authenticated, user, login, logout } = privyState;
    if (!ready) return <span style={{ fontSize: "11px" }}>loading…</span>;

    if (!authenticated) {
        return (
            <button
                onClick={() => { login(); onAfterAction(); }}
                style={{ width: "100%" }}
            >
                Sign in…
            </button>
        );
    }
    const label = user?.email?.address ??
        (address ? shortenHex(address) : user?.wallet?.address ? shortenHex(user.wallet.address) : "Account");
    return (
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", gap: "8px" }}>
            <span className="w7-mono" style={{ fontSize: "11px" }}>{label}</span>
            <button onClick={() => { logout(); onAfterAction(); }}>Sign out</button>
        </div>
    );
}
