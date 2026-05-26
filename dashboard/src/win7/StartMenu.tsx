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

                {/* Dual Column Layout */}
                <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
                    {/* Left Column: Programs List */}
                    <div style={{ flex: 1, background: "#ffffff", display: "flex", flexDirection: "column", padding: "4px 6px" }}>
                        <ul className="w7-start-menu-list" style={{ flex: 1, margin: 0, padding: 0, overflowY: "auto" }}>
                            {["sender", "operator", "recipient", "readme"].map((id) => {
                                const app = APPS[id];
                                if (!app) return null;
                                return (
                                    <MenuItem
                                        key={app.id}
                                        icon={app.icon}
                                        label={app.title.split(" — ")[0]}
                                        onClick={() => launch(app.id, app.title)}
                                    />
                                );
                            })}
                        </ul>

                        {/* Start Menu Search Box (Win7 Classic) */}
                        <div style={{
                            padding: "6px 4px 4px 4px",
                            borderTop: "1px solid rgba(0, 0, 0, 0.08)",
                            marginTop: "auto",
                            display: "flex",
                            alignItems: "center"
                        }}>
                            <div style={{
                                position: "relative",
                                width: "100%",
                                display: "flex",
                                alignItems: "center"
                            }}>
                                <input 
                                    type="text" 
                                    placeholder="Search programs and files" 
                                    disabled
                                    style={{
                                        width: "100%",
                                        height: "22px",
                                        padding: "2px 24px 2px 6px",
                                        fontSize: "11px",
                                        fontStyle: "italic",
                                        fontFamily: "Segoe UI, sans-serif",
                                        border: "1px solid #7a96df",
                                        boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.1)",
                                        borderRadius: "2px",
                                        background: "#ffffff",
                                        color: "#7f7f7f"
                                    }}
                                />
                                <span style={{
                                    position: "absolute",
                                    right: "6px",
                                    color: "#7a96df",
                                    fontSize: "12px",
                                    pointerEvents: "none"
                                }}>🔍</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Explorer Quick Links */}
                    <div
                        style={{
                            width: "140px",
                            background: "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.04) 100%)",
                            borderLeft: "1px solid rgba(0, 30, 80, 0.12)",
                            boxShadow: "inset 1px 0 0 rgba(255,255,255,0.45)",
                            display: "flex",
                            flexDirection: "column",
                            padding: "8px 6px",
                            gap: "4px",
                        }}
                    >
                        {["myComputer", "arcscan", "recycleBin"].map((id) => {
                            const app = APPS[id];
                            if (!app) return null;
                            return (
                                <button
                                    key={app.id}
                                    type="button"
                                    onClick={() => launch(app.id, app.title)}
                                    className="w7-start-right-link"
                                >
                                    <Icon icon={app.icon} size={16} />
                                    <span>{app.title.split(" — ")[0]}</span>
                                </button>
                            );
                        })}
                        <div style={{ flex: 1 }} />
                        <button
                            type="button"
                            onClick={() => {
                                close();
                                window.dispatchEvent(new CustomEvent("conduit:tour:start"));
                            }}
                            className="w7-start-right-link"
                            title="Replay the welcome tour"
                        >
                            <span aria-hidden="true" style={{ fontSize: "14px", lineHeight: 1, width: 16, textAlign: "center" }}>?</span>
                            <span>Take the tour</span>
                        </button>
                    </div>
                </div>

                {/* Footer with account / shutdown actions */}
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
