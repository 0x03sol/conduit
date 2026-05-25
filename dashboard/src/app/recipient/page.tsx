"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";

import { fetchRecipientBatches, STATUS_LABEL, type IndexedRecipientWithBatch } from "@/lib/indexer";
import { tickerToInfo } from "@/lib/contracts";
import { arcScanTx, formatAmount, shortenHex } from "@/lib/format";

export default function RecipientPage() {
    const { address } = useAccount();
    const [walletInput, setWalletInput] = useState<string>("");
    const [activeWallet, setActiveWallet] = useState<`0x${string}` | null>(null);
    const [items, setItems] = useState<IndexedRecipientWithBatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-fill connected address into the search field.
    useEffect(() => {
        if (address && !walletInput) setWalletInput(address);
    }, [address, walletInput]);

    function search(e?: React.FormEvent) {
        e?.preventDefault();
        setError(null);
        const trimmed = walletInput.trim() as `0x${string}`;
        if (!isAddress(trimmed)) {
            setError("invalid address");
            return;
        }
        setActiveWallet(trimmed);
        setLoading(true);
        fetchRecipientBatches(trimmed, 100)
            .then(setItems)
            .catch((err) => setError(String(err)))
            .finally(() => setLoading(false));
    }

    function useConnected() {
        if (!address) return;
        setWalletInput(address);
        setActiveWallet(address);
        setLoading(true);
        fetchRecipientBatches(address, 100)
            .then(setItems)
            .catch((err) => setError(String(err)))
            .finally(() => setLoading(false));
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-medium">Recipient</h1>
                <p className="text-sm text-ink-soft mt-1">
                    Look up incoming Conduit payments by wallet address.
                </p>
            </div>

            <form onSubmit={search} className="flex gap-2">
                <input
                    value={walletInput}
                    onChange={(e) => setWalletInput(e.target.value)}
                    placeholder="0x… recipient address"
                    className="flex-1 font-mono text-sm border border-border rounded px-3 py-2"
                />
                <button type="submit" className="px-4 py-2 bg-ink text-paper rounded text-sm hover:bg-ink-soft">
                    Search
                </button>
                {address && (
                    <button
                        type="button"
                        onClick={useConnected}
                        className="px-4 py-2 border border-border rounded text-sm hover:border-signal"
                    >
                        Use connected
                    </button>
                )}
            </form>

            {error && <div className="text-sm text-red-700">{error}</div>}

            {activeWallet && (
                <p className="text-xs text-ink-soft">
                    Showing payments for <span className="font-mono">{shortenHex(activeWallet, 8, 6)}</span>
                </p>
            )}

            {loading ? (
                <p className="text-sm text-ink-soft">loading…</p>
            ) : items.length === 0 && activeWallet ? (
                <p className="text-sm text-ink-soft">no payments found</p>
            ) : items.length > 0 ? (
                <div className="rounded-md border border-border overflow-x-auto">
                    <table className="w-full min-w-[680px] text-sm tabular">
                        <thead className="bg-paper-soft text-xs text-ink-soft/80">
                            <tr>
                                <th className="text-left px-4 py-2 font-normal">batch</th>
                                <th className="text-left px-4 py-2 font-normal">from</th>
                                <th className="text-right px-4 py-2 font-normal">amount</th>
                                <th className="text-left px-4 py-2 font-normal">currency</th>
                                <th className="text-left px-4 py-2 font-normal">status</th>
                                <th className="text-left px-4 py-2 font-normal">tx</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((row) => {
                                const tokenInfo = tickerToInfo(row.outputCurrency);
                                return (
                                    <tr key={row.id} className="border-t border-border hover:bg-paper-soft">
                                        <td className="px-4 py-2 font-mono text-xs">{shortenHex(row.batchId)}</td>
                                        <td className="px-4 py-2 font-mono text-xs">{shortenHex(row.batch.sender)}</td>
                                        <td className="px-4 py-2 text-right">
                                            {formatAmount(row.amount, tokenInfo?.decimals ?? 6)}
                                        </td>
                                        <td className="px-4 py-2">{tokenInfo?.symbol ?? "—"}</td>
                                        <td className="px-4 py-2">
                                            {STATUS_LABEL[row.batch.status as keyof typeof STATUS_LABEL] ?? row.batch.status}
                                        </td>
                                        <td className="px-4 py-2">
                                            {row.batch.settledTxHash ? (
                                                <a
                                                    href={arcScanTx(row.batch.settledTxHash)}
                                                    className="font-mono text-xs text-signal underline"
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    {shortenHex(row.batch.settledTxHash)}
                                                </a>
                                            ) : (
                                                "—"
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    );
}
