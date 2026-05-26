"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { arcTestnet } from "@/lib/chains";
import { useArcLive } from "@/components/useArcLive";

/* ------------------------------------------------------------------ */
/* Live Arc chain stats — polled every 15 s from Arcscan public API.  */
/* ------------------------------------------------------------------ */

type ChainStats = {
    block: number | null;
    gasGwei: number | null;
    txs: number | null;
};

const STATS_URL = "https://testnet.arcscan.app/api/v2/stats";
const BLOCK_URL = "https://testnet.arcscan.app/api?module=block&action=eth_block_number";

/**
 * Poll Arcscan every `intervalMs` for block height / gas price / tx count.
 * Last-known values are kept on transient failures (no crash, no flicker).
 *
 * Note on endpoints: of the three endpoints in the spec only the
 * `eth_block_number` JSON-RPC works; `/api/v1/counters` and the
 * `gastracker/gasoracle` etherscan compatibility endpoints are not exposed
 * by this Blockscout instance. The Blockscout-native `/api/v2/stats`
 * endpoint returns total_transactions and gas_prices in a single call,
 * so we use it for those two metrics.
 */
function useArcChainStats(intervalMs = 15_000): ChainStats {
    const [stats, setStats] = useState<ChainStats>({ block: null, gasGwei: null, txs: null });

    useEffect(() => {
        let cancelled = false;

        const fetchOnce = async () => {
            // Pull both endpoints in parallel; either may fail independently
            // and we just preserve the last-known value for that field.
            const [blockRes, statsRes] = await Promise.allSettled([
                fetch(BLOCK_URL, { credentials: "omit", cache: "no-store" }).then((r) => r.json()),
                fetch(STATS_URL, { credentials: "omit", cache: "no-store" }).then((r) => r.json()),
            ]);

            if (cancelled) return;

            setStats((prev) => {
                let block = prev.block;
                let gasGwei = prev.gasGwei;
                let txs = prev.txs;

                if (blockRes.status === "fulfilled") {
                    const hex = blockRes.value?.result;
                    if (typeof hex === "string" && hex.startsWith("0x")) {
                        const n = parseInt(hex, 16);
                        if (Number.isFinite(n) && n > 0) block = n;
                    }
                }

                if (statsRes.status === "fulfilled") {
                    const data = statsRes.value;
                    const avgGas = data?.gas_prices?.average;
                    if (typeof avgGas === "number" && avgGas >= 0) gasGwei = avgGas;
                    const tot = parseInt(data?.total_transactions ?? "", 10);
                    if (Number.isFinite(tot) && tot > 0) txs = tot;
                    // Fallback: if the JSON-RPC block call fails, use the
                    // total_blocks number from /stats as a stale-but-valid value.
                    if (block === null) {
                        const tb = parseInt(data?.total_blocks ?? "", 10);
                        if (Number.isFinite(tb) && tb > 0) block = tb;
                    }
                }

                return { block, gasGwei, txs };
            });
        };

        fetchOnce();
        const id = setInterval(fetchOnce, intervalMs);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [intervalMs]);

    return stats;
}

/* ------------------------------------------------------------------ */
/* Formatters                                                         */
/* ------------------------------------------------------------------ */

const fmtBlock = (n: number | null): string =>
    n === null ? "—" : `#${n.toLocaleString("en-US")}`;

const fmtGas = (g: number | null): string => {
    if (g === null) return "—";
    if (g >= 10) return `${g.toFixed(1)} Gwei`;
    if (g >= 1) return `${g.toFixed(2)} Gwei`;
    return `${g.toFixed(3)} Gwei`;
};

const fmtTxs = (n: number | null): string => {
    if (n === null) return "—";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B txs`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M txs`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K txs`;
    return `${n} txs`;
};

/* ------------------------------------------------------------------ */
/* SystemTray component                                               */
/* ------------------------------------------------------------------ */

export function SystemTray() {
    const [mounted, setMounted] = useState(false);
    const [now, setNow] = useState<Date>(() => new Date());
    const { address, chainId } = useAccount();
    const onArc = chainId === arcTestnet.id;
    const arcStats = useArcChainStats(15_000);
    const { rate: liveRate } = useArcLive();

    useEffect(() => {
        setMounted(true);
        setNow(new Date());
        const t = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(t);
    }, []);

    // SSR-safe placeholder so the server-rendered HTML matches the first
    // client render. Real values appear after hydration.
    if (!mounted) {
        return (
            <div className="w7-tray" aria-hidden="true">
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#aaa" }} />
                <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.1", textAlign: "right", visibility: "hidden" }}>
                    <span style={{ fontSize: "11px" }}>00:00</span>
                    <span style={{ fontSize: "10px" }}>0/0/0000</span>
                </div>
            </div>
        );
    }

    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = now.toLocaleDateString([], { day: "numeric", month: "numeric", year: "numeric" });

    const statsTitle =
        `Arc testnet — refreshed every 15 s\n` +
        `Block: ${fmtBlock(arcStats.block)}\n` +
        `Avg gas: ${fmtGas(arcStats.gasGwei)}\n` +
        `Total transactions: ${fmtTxs(arcStats.txs)}`;

    return (
        <div className="w7-tray" title={address ? `Connected: ${address}` : "Not connected"}>
            {/* Live Arc chain stats strip — block / gas / total tx count */}
            <div
                className="w7-arc-stats"
                title={statsTitle}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.92)",
                    fontVariantNumeric: "tabular-nums",
                    paddingRight: "10px",
                    borderRight: "1px solid rgba(255,255,255,0.20)",
                    marginRight: "2px",
                    whiteSpace: "nowrap",
                }}
            >
                <span aria-label="latest block">⬡ {fmtBlock(arcStats.block)}</span>
                <span aria-label="average gas price">⛽ {fmtGas(arcStats.gasGwei)}</span>
                <span aria-label="total transactions">📊 {fmtTxs(arcStats.txs)}</span>
                <span
                    aria-label="live transactions per second"
                    title="Each streak in the sky is one live transaction. Live from arcscan."
                    style={{ color: "rgba(140, 200, 255, 0.95)" }}
                >
                    🌠 {liveRate < 0.05 ? "0.0" : liveRate.toFixed(liveRate < 10 ? 1 : 0)}/s
                </span>
            </div>

            {/* Classic Windows 7 Wireless Network Strength Bars */}
            <div
                style={{ display: "flex", alignItems: "flex-end", gap: "1px", height: "12px", width: "16px", paddingBottom: "1px", cursor: "default" }}
                aria-label="connection"
            >
                {[3, 5, 7, 9, 11].map((h, i) => {
                    const active = address && onArc;
                    const color = active ? "#5fe05f" : address ? "#ffae42" : "#666666";
                    return (
                        <div
                            key={i}
                            style={{
                                width: "2px",
                                height: `${h}px`,
                                background: color,
                                border: "1px solid rgba(0,0,0,0.25)",
                                boxShadow: "inset 0.5px 0.5px 0 rgba(255,255,255,0.25)",
                            }}
                        />
                    );
                })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.1", textAlign: "right" }}>
                <span style={{ fontSize: "11px" }}>{time}</span>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)" }}>{date}</span>
            </div>
        </div>
    );
}
