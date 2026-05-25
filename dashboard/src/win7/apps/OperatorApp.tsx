"use client";

import { useEffect, useState } from "react";
import { useWatchContractEvent } from "wagmi";

import { ADDRESSES, batchRouterAbi } from "@/lib/contracts";
import { fetchRecentSettlements, STATUS_LABEL, type IndexedBatch } from "@/lib/indexer";
import { arcScanTx, formatAmount, shortenHex, timeAgo } from "@/lib/format";

export function OperatorApp() {
    const [items, setItems] = useState<IndexedBatch[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [liveTicks, setLiveTicks] = useState<{ batchId: string; at: number }[]>([]);

    useEffect(() => {
        let alive = true;
        const load = () =>
            fetchRecentSettlements(50)
                .then((rows) => alive && setItems(rows))
                .catch((e) => alive && setError(String(e)))
                .finally(() => alive && setLoading(false));
        load();
        const t = setInterval(load, 6_000);
        return () => { alive = false; clearInterval(t); };
    }, []);

    useWatchContractEvent({
        abi: batchRouterAbi,
        address: ADDRESSES.batchRouter,
        eventName: "BatchSettled",
        onLogs: (logs) => {
            const now = Math.floor(Date.now() / 1000);
            setLiveTicks((prev) => [
                ...logs.map((l) => ({ batchId: String((l.args as { batchId: string }).batchId), at: now })),
                ...prev,
            ].slice(0, 5));
        },
    });

    return (
        <div style={{ padding: "10px" }}>
            <p style={{ margin: "0 0 10px 0" }}>
                Live feed of every settled batch on{" "}
                <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">Arc testnet</a>.
                Indexer polls every 6 seconds.
            </p>

            {liveTicks.length > 0 && (
                <div role="tooltip" style={{ position: "static", display: "block", marginBottom: "8px" }}>
                    Live: {liveTicks.length} batch(es) settled in this session
                </div>
            )}
            {error && (
                <div role="tooltip" style={{ position: "static", display: "block", marginBottom: "8px", background: "#ffe1e1" }}>
                    Indexer unreachable: {error}
                </div>
            )}

            <table className="has-shadow" style={{ width: "100%" }}>
                <thead>
                    <tr>
                        <th>batchId</th>
                        <th>sender</th>
                        <th style={{ textAlign: "right" }}>distributed</th>
                        <th style={{ textAlign: "right" }}>recipients</th>
                        <th>status</th>
                        <th>settled</th>
                        <th>tx</th>
                    </tr>
                </thead>
                <tbody>
                    {loading && (
                        <tr><td colSpan={7} style={{ textAlign: "center", padding: "12px" }}>loading…</td></tr>
                    )}
                    {!loading && items.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: "center", padding: "12px" }}>no settled batches yet</td></tr>
                    )}
                    {items.map((b) => (
                        <tr key={b.id}>
                            <td className="w7-mono">{shortenHex(b.id)}</td>
                            <td className="w7-mono">{shortenHex(b.sender)}</td>
                            <td style={{ textAlign: "right" }} className="w7-tabular">
                                {b.totalDistributed ? formatAmount(b.totalDistributed, 6) : "—"}
                            </td>
                            <td style={{ textAlign: "right" }} className="w7-tabular">{b.recipientCount}</td>
                            <td>{STATUS_LABEL[b.status] ?? b.status}</td>
                            <td>{b.settledAt ? timeAgo(b.settledAt) : "—"}</td>
                            <td>
                                {b.settledTxHash ? (
                                    <a href={arcScanTx(b.settledTxHash)} className="w7-mono" target="_blank" rel="noreferrer">
                                        {shortenHex(b.settledTxHash)}
                                    </a>
                                ) : "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
