"use client";

import { useEffect, useState } from "react";
import { useWatchContractEvent } from "wagmi";

import { ADDRESSES, batchRouterAbi } from "@/lib/contracts";
import { fetchRecentSettlements, STATUS_LABEL, type IndexedBatch } from "@/lib/indexer";
import { arcScanTx, formatAmount, shortenHex, timeAgo } from "@/lib/format";

export default function OperatorPage() {
    const [items, setItems] = useState<IndexedBatch[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        const load = () =>
            fetchRecentSettlements(50)
                .then((rows) => alive && setItems(rows))
                .catch((e) => alive && setError(String(e)))
                .finally(() => alive && setLoading(false));
        load();
        const t = setInterval(load, 6_000);
        return () => {
            alive = false;
            clearInterval(t);
        };
    }, []);

    // Live ticker — when a new BatchSettled fires on chain, prepend a
    // synthetic row so the operator sees instant feedback without waiting for
    // the indexer's poll.
    const [liveTicks, setLiveTicks] = useState<{ batchId: string; at: number }[]>([]);
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
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-medium">Operator</h1>
                <p className="text-sm text-ink-soft mt-1">
                    Live feed of every settled batch on{" "}
                    <a className="text-signal" href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
                        Arc testnet
                    </a>
                    . Indexer polls every 6 seconds; on-chain events also push live ticks.
                </p>
            </div>

            {liveTicks.length > 0 && (
                <div className="rounded-md border border-signal/40 bg-signal/5 px-4 py-2 text-xs">
                    Live: {liveTicks.length} batch(es) settled in this session
                </div>
            )}

            {error && <div className="text-sm text-red-700">indexer unreachable: {error}</div>}

            <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm tabular">
                    <thead className="bg-paper-soft text-xs text-ink-soft/80">
                        <tr>
                            <th className="text-left px-4 py-2 font-normal">batchId</th>
                            <th className="text-left px-4 py-2 font-normal">sender</th>
                            <th className="text-right px-4 py-2 font-normal">distributed</th>
                            <th className="text-right px-4 py-2 font-normal">recipients</th>
                            <th className="text-left px-4 py-2 font-normal">status</th>
                            <th className="text-left px-4 py-2 font-normal">settled</th>
                            <th className="text-left px-4 py-2 font-normal">tx</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-soft">loading…</td></tr>
                        )}
                        {!loading && items.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-soft">no settled batches yet</td></tr>
                        )}
                        {items.map((b) => (
                            <tr key={b.id} className="border-t border-border hover:bg-paper-soft">
                                <td className="px-4 py-2 font-mono text-xs">{shortenHex(b.id)}</td>
                                <td className="px-4 py-2 font-mono text-xs">{shortenHex(b.sender)}</td>
                                <td className="px-4 py-2 text-right">
                                    {b.totalDistributed ? formatAmount(b.totalDistributed, 6) : "—"}
                                </td>
                                <td className="px-4 py-2 text-right">{b.recipientCount}</td>
                                <td className="px-4 py-2">{STATUS_LABEL[b.status] ?? b.status}</td>
                                <td className="px-4 py-2">{b.settledAt ? timeAgo(b.settledAt) : "—"}</td>
                                <td className="px-4 py-2">
                                    {b.settledTxHash ? (
                                        <a
                                            href={arcScanTx(b.settledTxHash)}
                                            className="font-mono text-xs text-signal underline"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {shortenHex(b.settledTxHash)}
                                        </a>
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
