"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";

import { ArcLogo } from "../win7/ArcLogo";

const STORAGE_KEY = "conduit-tour-completed";

/**
 * Dispatch this from anywhere to relaunch the tour:
 *   window.dispatchEvent(new CustomEvent("conduit:tour:start"))
 */
const RELAUNCH_EVENT = "conduit:tour:start";

interface Step {
    title: string;
    body: ReactNode;
    /** Optional secondary action surfaced on the footer (left of Back/Next). */
    cta?: { label: string; onClick: () => void; disabled?: boolean };
}

/* -------------------------------------------------------------------- */
/* OnboardingTour                                                       */
/*                                                                      */
/* A non-modal floating wizard. Auto-opens on first visit (suppressed   */
/* via localStorage on subsequent visits). User can keep interacting    */
/* with the dashboard; the wizard sits in the bottom-right and is       */
/* dismissable at any point.                                            */
/* -------------------------------------------------------------------- */

export function OnboardingTour() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState(0);

    // Privy may not be mounted (no app id) — guard the call.
    let privy: ReturnType<typeof usePrivy> | null = null;
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        privy = usePrivy();
    } catch {
        privy = null;
    }

    /* First-visit auto-open + global relaunch listener */
    useEffect(() => {
        if (typeof window === "undefined") return;
        const seen = window.localStorage.getItem(STORAGE_KEY) === "1";
        let timer: ReturnType<typeof setTimeout> | null = null;
        if (!seen) {
            timer = setTimeout(() => setOpen(true), 900);
        }
        const onRelaunch = () => {
            setStep(0);
            setOpen(true);
        };
        window.addEventListener(RELAUNCH_EVENT, onRelaunch);
        return () => {
            if (timer) clearTimeout(timer);
            window.removeEventListener(RELAUNCH_EVENT, onRelaunch);
        };
    }, []);

    const close = (markSeen = true) => {
        if (markSeen && typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, "1");
        }
        setOpen(false);
        // Reset step so a relaunch starts at 0 even if the user closes mid-tour.
        setStep(0);
    };

    const canSignIn = !!(privy && privy.ready && !privy.authenticated);

    const steps: Step[] = [
        {
            title: "Welcome to Conduit",
            body: (
                <>
                    <P>
                        Conduit settles payroll, vendor payouts, and bulk transfers atomically across
                        chains. Burn USDC once on any CCTP-supported chain, distribute to many
                        recipients on Arc in regional stablecoins.
                    </P>
                    <P muted>About 90 seconds. You can close this at any time.</P>
                </>
            ),
        },
        {
            title: "The sky is alive",
            body: (
                <>
                    <P>
                        Each streak overhead is one real transaction landing on Arc testnet, right
                        now. The readout in the bottom-left tracks block height and live tx rate.
                    </P>
                    <P>
                        Hover any meteor to see its tx hash, click to inspect it in the Arcscan
                        window.
                    </P>
                </>
            ),
        },
        {
            title: "Three roles, three apps",
            body: (
                <>
                    <P>The icons on the left are eight apps. The three at Conduit's core:</P>
                    <RoleList>
                        <Role label="Batch Builder">
                            Upload a CSV, validate recipients, register a batch on Arc.
                        </Role>
                        <Role label="Settlement Monitor">
                            Watch every batch settle. Live event feed.
                        </Role>
                        <Role label="Inbox">Look up incoming payments by wallet.</Role>
                    </RoleList>
                </>
            ),
        },
        {
            title: "How a settlement happens",
            body: (
                <>
                    <P>One CSV, one fee, one CCTP burn:</P>
                    <Steps>
                        <Numbered n={1}>Upload &amp; register the batch on Arc.</Numbered>
                        <Numbered n={2}>Burn USDC on the source chain (e.g. Sepolia).</Numbered>
                        <Numbered n={3}>
                            The hook on Arc swaps to the right currency and distributes to all
                            recipients atomically.
                        </Numbered>
                    </Steps>
                    <P muted>Average proven settle time: 24 seconds.</P>
                </>
            ),
        },
        {
            title: "Optional, connect a wallet",
            body: (
                <>
                    <P>
                        You can browse Conduit fully without a wallet. To register a batch or view
                        your inbox, sign in via the Start menu. Privy supports email or wallet, and
                        creates an embedded wallet automatically if you don't have one.
                    </P>
                    <P muted>This step is optional. Skip it and explore.</P>
                </>
            ),
            cta: canSignIn
                ? {
                      label: "Sign in now",
                      onClick: () => {
                          privy?.login();
                      },
                  }
                : undefined,
        },
        {
            title: "You're set",
            body: (
                <>
                    <P>
                        Double-click any icon to open it. Right-click is intentionally absent
                        (Conduit is read-mostly).
                    </P>
                    <P>
                        Want to re-run this tour? Open the Start menu and click{" "}
                        <Mono>Take the tour</Mono>.
                    </P>
                </>
            ),
        },
    ];

    if (!open) return null;
    const cur = steps[step]!;
    const isFirst = step === 0;
    const isLast = step === steps.length - 1;

    return (
        <div
            role="dialog"
            aria-label="Conduit setup tour"
            aria-live="polite"
            style={{
                position: "fixed",
                right: "24px",
                bottom: "60px",
                width: "400px",
                maxWidth: "calc(100vw - 32px)",
                zIndex: 9050,
                pointerEvents: "auto",
                userSelect: "none",
                /* Tinted off-white outer surface, never #ffffff */
                background:
                    "linear-gradient(180deg, oklch(0.985 0.004 230) 0%, oklch(0.97 0.006 230) 100%)",
                color: "oklch(0.20 0.02 240)",
                border: "1px solid oklch(0.78 0.02 230)",
                borderRadius: "8px",
                /* Soft elevation, not glassmorphism */
                boxShadow:
                    "0 22px 40px -12px oklch(0.20 0.05 240 / 0.45), 0 4px 12px oklch(0.20 0.05 240 / 0.18)",
                overflow: "hidden",
                fontFamily: '"Segoe UI", "Selawik", system-ui, sans-serif',
                fontSize: "12px",
                lineHeight: 1.5,
            }}
        >
            {/* Title bar — Win7 wizard top with Λ Arc icon */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 10px 8px 12px",
                    background:
                        "linear-gradient(180deg, oklch(0.92 0.04 230) 0%, oklch(0.85 0.06 230) 100%)",
                    borderBottom: "1px solid oklch(0.74 0.04 230)",
                    color: "oklch(0.18 0.04 240)",
                }}
            >
                <span
                    style={{
                        background: "oklch(0.42 0.10 250)",
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    <ArcLogo size={16} />
                </span>
                <span style={{ fontWeight: 600, fontSize: "12px", flex: 1 }}>
                    Conduit setup tour
                </span>
                <button
                    type="button"
                    aria-label="Close tour"
                    onClick={() => close(true)}
                    style={{
                        appearance: "none",
                        background: "transparent",
                        border: "none",
                        font: "inherit",
                        fontSize: "13px",
                        lineHeight: 1,
                        padding: "2px 6px",
                        color: "oklch(0.30 0.03 240)",
                        cursor: "pointer",
                        borderRadius: 3,
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                            "oklch(0.86 0.04 230)";
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Body — white box (tinted), explanatory text */}
            <div
                style={{
                    background: "oklch(0.99 0.003 230)",
                    padding: "20px 22px 18px",
                    minHeight: "180px",
                }}
            >
                <h2
                    style={{
                        margin: 0,
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "oklch(0.22 0.04 250)",
                        letterSpacing: "-0.005em",
                        marginBottom: "10px",
                    }}
                >
                    {cur.title}
                </h2>
                <div style={{ color: "oklch(0.32 0.02 240)" }}>{cur.body}</div>
            </div>

            {/* Footer — step indicator + Back / Next */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderTop: "1px solid oklch(0.86 0.02 230)",
                    background:
                        "linear-gradient(180deg, oklch(0.96 0.005 230) 0%, oklch(0.92 0.012 230) 100%)",
                }}
            >
                <span
                    aria-label={`Step ${step + 1} of ${steps.length}`}
                    style={{
                        fontSize: "10.5px",
                        fontFamily: '"Consolas", "SF Mono", monospace',
                        color: "oklch(0.45 0.02 240)",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                    }}
                >
                    {String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                </span>

                <Dots count={steps.length} active={step} />

                <div style={{ flex: 1 }} />

                {cur.cta && (
                    <button
                        type="button"
                        onClick={cur.cta.onClick}
                        disabled={cur.cta.disabled}
                        style={subtleBtnStyle}
                    >
                        {cur.cta.label}
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={isFirst}
                    style={{
                        ...ghostBtnStyle,
                        opacity: isFirst ? 0.4 : 1,
                        cursor: isFirst ? "default" : "pointer",
                    }}
                >
                    Back
                </button>

                <button
                    type="button"
                    onClick={() => {
                        if (isLast) close(true);
                        else setStep((s) => s + 1);
                    }}
                    style={primaryBtnStyle}
                >
                    {isLast ? "Done" : "Next"}
                </button>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------- */
/* Helpers (text + button atoms)                                        */
/* -------------------------------------------------------------------- */

function P({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
    return (
        <p
            style={{
                margin: 0,
                marginBottom: 8,
                color: muted ? "oklch(0.50 0.02 240)" : "oklch(0.28 0.02 240)",
                fontSize: muted ? "11.5px" : "12px",
                lineHeight: 1.55,
            }}
        >
            {children}
        </p>
    );
}

function Mono({ children }: { children: ReactNode }) {
    return (
        <code
            style={{
                fontFamily: '"Consolas", "SF Mono", monospace',
                fontSize: "11.5px",
                background: "oklch(0.93 0.01 240)",
                padding: "1px 5px",
                borderRadius: 3,
                color: "oklch(0.22 0.04 250)",
            }}
        >
            {children}
        </code>
    );
}

function RoleList({ children }: { children: ReactNode }) {
    return (
        <ul
            style={{
                listStyle: "none",
                padding: 0,
                margin: "4px 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
            }}
        >
            {children}
        </ul>
    );
}

function Role({ label, children }: { label: string; children: ReactNode }) {
    return (
        <li style={{ display: "flex", gap: "10px", lineHeight: 1.4 }}>
            <span
                style={{
                    fontWeight: 600,
                    color: "oklch(0.30 0.10 245)",
                    flex: "0 0 130px",
                    fontSize: "11.5px",
                }}
            >
                {label}
            </span>
            <span style={{ color: "oklch(0.40 0.02 240)", fontSize: "11.5px" }}>{children}</span>
        </li>
    );
}

function Steps({ children }: { children: ReactNode }) {
    return (
        <ol
            style={{
                margin: "4px 0 8px",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
            }}
        >
            {children}
        </ol>
    );
}

function Numbered({ n, children }: { n: number; children: ReactNode }) {
    return (
        <li style={{ display: "flex", gap: "10px", alignItems: "baseline", lineHeight: 1.45 }}>
            <span
                aria-hidden="true"
                style={{
                    flex: "0 0 18px",
                    fontFamily: '"Consolas", "SF Mono", monospace',
                    fontSize: "10.5px",
                    color: "oklch(0.45 0.02 240)",
                    textAlign: "right",
                }}
            >
                {n}.
            </span>
            <span style={{ color: "oklch(0.32 0.02 240)", fontSize: "11.5px" }}>{children}</span>
        </li>
    );
}

function Dots({ count, active }: { count: number; active: number }) {
    return (
        <span
            aria-hidden="true"
            style={{ display: "inline-flex", gap: "4px", alignItems: "center", marginLeft: 4, flexShrink: 0 }}
        >
            {Array.from({ length: count }).map((_, i) => (
                <span
                    key={i}
                    style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background:
                            i === active
                                ? "oklch(0.40 0.13 250)"
                                : i < active
                                ? "oklch(0.78 0.04 240)"
                                : "oklch(0.88 0.02 240)",
                        transition: "background 200ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                />
            ))}
        </span>
    );
}

const baseBtnStyle: React.CSSProperties = {
    appearance: "none",
    fontFamily: "inherit",
    fontSize: "11.5px",
    fontWeight: 500,
    padding: "5px 14px",
    borderRadius: 4,
    cursor: "pointer",
    lineHeight: 1.4,
    transition: "background 150ms cubic-bezier(0.16, 1, 0.3, 1), border-color 150ms",
};

const primaryBtnStyle: React.CSSProperties = {
    ...baseBtnStyle,
    background:
        "linear-gradient(180deg, oklch(0.65 0.14 250) 0%, oklch(0.42 0.16 252) 100%)",
    color: "oklch(0.99 0.003 240)",
    border: "1px solid oklch(0.30 0.14 252)",
    boxShadow: "inset 0 1px 0 oklch(0.85 0.07 240 / 0.6)",
};

const ghostBtnStyle: React.CSSProperties = {
    ...baseBtnStyle,
    background:
        "linear-gradient(180deg, oklch(0.97 0.005 230) 0%, oklch(0.91 0.012 230) 100%)",
    color: "oklch(0.30 0.03 240)",
    border: "1px solid oklch(0.78 0.02 230)",
};

const subtleBtnStyle: React.CSSProperties = {
    ...baseBtnStyle,
    background: "transparent",
    color: "oklch(0.42 0.13 252)",
    border: "1px solid oklch(0.78 0.07 240)",
    fontWeight: 500,
    whiteSpace: "nowrap",
};
