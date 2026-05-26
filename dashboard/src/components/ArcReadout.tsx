"use client";

import { useEffect, useState } from "react";

import { useArcLive } from "./useArcLive";

/**
 * ArcReadout
 *
 * Observatory-style instrument readout, bottom-left, above the taskbar.
 * Always visible; reads ambient — block height (polled) and live tx/s
 * rate from the Arcscan WebSocket. Tells the user, in the dashboard's
 * own observatory voice, that the streaks overhead are real txs.
 *
 * No card, no border, no panel. Just typography on the desktop.
 */

const STATS_URL = "https://testnet.arcscan.app/api/v2/stats";

type StatsRow = { block: number | null };

function useChainBlock(): StatsRow {
    const [row, setRow] = useState<StatsRow>({ block: null });
    useEffect(() => {
        let alive = true;
        const tick = async () => {
            try {
                const res = await fetch(STATS_URL, { credentials: "omit", cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                const blockStr = data?.total_blocks;
                const n = typeof blockStr === "string" ? parseInt(blockStr, 10) : NaN;
                if (alive && Number.isFinite(n) && n > 0) setRow({ block: n });
            } catch {
                /* keep last known */
            }
        };
        tick();
        const id = setInterval(tick, 15_000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);
    return row;
}

const STATUS_LABEL: Record<string, string> = {
    connecting: "● connecting",
    live:       "● live",
    polling:    "● polling",
    offline:    "● offline",
};

const STATUS_COLOR: Record<string, string> = {
    connecting: "rgba(220, 195, 90, 0.85)",
    live:       "rgba(120, 220, 150, 0.95)",
    polling:    "rgba(220, 175, 100, 0.95)",
    offline:    "rgba(180, 180, 180, 0.7)",
};

export function ArcReadout() {
    const { rate, status } = useArcLive();
    const { block } = useChainBlock();

    const blockStr = block !== null ? `#${block.toLocaleString("en-US")}` : "#—";
    const rateStr = rate < 0.05 ? "0.0" : rate.toFixed(rate < 10 ? 1 : 0);

    return (
        <div
            aria-label="Arc testnet live readout"
            style={{
                position: "fixed",
                left: "120px", // clear of the icon column (80px wide + ~30px margin)
                bottom: "52px", // above the 40px taskbar with 12px breathing room
                zIndex: 5,
                pointerEvents: "none",
                userSelect: "none",
                fontFamily: '"Consolas", "SF Mono", "Menlo", monospace',
                fontSize: "10.5px",
                lineHeight: 1.55,
                color: "rgba(220, 230, 245, 0.78)",
                letterSpacing: "0.02em",
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
                fontVariantNumeric: "tabular-nums",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginBottom: "2px" }}>
                <span style={{ color: "rgba(180, 200, 230, 0.55)" }}>arcscan / testnet</span>
                <span style={{ color: STATUS_COLOR[status] ?? STATUS_COLOR.offline }}>
                    {STATUS_LABEL[status] ?? STATUS_LABEL.offline}
                </span>
            </div>
            <Row k="block" v={blockStr} />
            <Row k="rate" v={`${rateStr} tx / s`} />
            <Row k="sky" v="≡ live txs" accent />
        </div>
    );
}

function Row({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: "20px" }}>
            <span style={{ color: "rgba(180, 200, 230, 0.55)" }}>{k}</span>
            <span style={{ color: accent ? "rgba(140, 200, 255, 0.95)" : "rgba(235, 240, 250, 0.92)" }}>
                {v}
            </span>
        </div>
    );
}
