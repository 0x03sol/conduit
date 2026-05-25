"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { isAddress } from "viem";

import { fetchRecipientBatches, STATUS_LABEL, type IndexedRecipientWithBatch } from "@/lib/indexer";
import { tickerToInfo } from "@/lib/contracts";
import { arcScanTx, formatAmount, shortenHex } from "@/lib/format";

export function RecipientApp() {
    const { address } = useAccount();
    const [walletInput, setWalletInput] = useState<string>("");
    const [activeWallet, setActiveWallet] = useState<`0x${string}` | null>(null);
    const [items, setItems] = useState<IndexedRecipientWithBatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (address && !walletInput) setWalletInput(address);
    }, [address, walletInput]);

    function search(e?: React.FormEvent) {
        e?.preventDefault();
        setError(null);
        const trimmed = walletInput.trim() as `0x${string}`;
        if (!isAddress(trimmed)) { setError("invalid address"); return; }
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
        <div style={{ padding: "10px" }}>
            <p style={{ margin: "0 0 10px 0" }}>Look up incoming Conduit payments by wallet address.</p>

            <form onSubmit={search} style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
                <label htmlFor="wallet-search">Wallet:</label>
                <input
                    id="wallet-search"
                    type="text"
                    value={walletInput}
                    onChange={(e) => setWalletInput(e.target.value)}
                    placeholder="0x… recipient address"
                    style={{ flex: "1 1 380px" }}
                    className="w7-mono"
                />
                <button type="submit" className="default">Search</button>
                {address && (
                    <button type="button" onClick={useConnected}>Use connected</button>
                )}
            </form>

            {error && (
                <div role="tooltip" style={{ position: "static", display: "block", marginBottom: "10px", background: "#ffe1e1" }}>
                    {error}
                </div>
            )}
            {activeWallet && (
                <p style={{ margin: "0 0 8px 0" }}>
                    Showing payments for <span className="w7-mono">{shortenHex(activeWallet, 8, 6)}</span>
                </p>
            )}

            {loading ? (
                <p>loading…</p>
            ) : items.length === 0 && activeWallet ? (
                <p>no payments found</p>
            ) : items.length > 0 ? (
                <table className="has-shadow" style={{ width: "100%" }}>
                    <thead>
                        <tr>
                            <th>batch</th>
                            <th>from</th>
                            <th style={{ textAlign: "right" }}>amount</th>
                            <th>currency</th>
                            <th>status</th>
                            <th>tx</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((row) => {
                            const tokenInfo = tickerToInfo(row.outputCurrency);
                            return (
                                <tr key={row.id}>
                                    <td className="w7-mono">{shortenHex(row.batchId)}</td>
                                    <td className="w7-mono">{shortenHex(row.batch.sender)}</td>
                                    <td style={{ textAlign: "right" }} className="w7-tabular">
                                        {formatAmount(row.amount, tokenInfo?.decimals ?? 6)}
                                    </td>
                                    <td>{tokenInfo?.symbol ?? "—"}</td>
                                    <td>
                                        {STATUS_LABEL[row.batch.status as keyof typeof STATUS_LABEL] ?? row.batch.status}
                                    </td>
                                    <td>
                                        {row.batch.settledTxHash ? (
                                            <a href={arcScanTx(row.batch.settledTxHash)} className="w7-mono" target="_blank" rel="noreferrer">
                                                {shortenHex(row.batch.settledTxHash)}
                                            </a>
                                        ) : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            ) : null}
        </div>
    );
}
