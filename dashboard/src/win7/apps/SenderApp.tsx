"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { isAddress, parseUnits, type Address } from "viem";
import {
    useAccount,
    useChainId,
    useReadContract,
    useSwitchChain,
    useWaitForTransactionReceipt,
    useWriteContract,
} from "wagmi";

import {
    ADDRESSES,
    EURC_TICKER,
    USDC_TICKER,
    batchRegistryAbi,
    erc20Abi,
} from "@/lib/contracts";
import { arcScanTx, formatAmount, shortenHex } from "@/lib/format";
import { arcTestnet } from "@/lib/chains";
import { chord, tada } from "../sounds";

type RawRow = { wallet?: string; amount?: string; currency?: string };

interface ParsedRow {
    wallet: Address;
    amount: bigint;
    outputCurrency: `0x${string}`;
    rawAmount: string;
    currencySymbol: "USDC" | "EURC";
    decimals: 6;
    error?: string;
}

function parseCsv(text: string): ParsedRow[] {
    const out = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
    return out.data.map((row): ParsedRow => {
        const wallet = (row.wallet ?? "").trim();
        const amountStr = (row.amount ?? "").trim();
        const currency = ((row.currency ?? "USDC").trim().toUpperCase()) as "USDC" | "EURC";
        const baseRow: ParsedRow = {
            wallet: wallet as Address,
            amount: 0n,
            outputCurrency: USDC_TICKER,
            rawAmount: amountStr,
            currencySymbol: currency === "EURC" ? "EURC" : "USDC",
            decimals: 6,
        };
        if (!isAddress(wallet)) return { ...baseRow, error: "invalid address" };
        if (!/^\d+(\.\d+)?$/.test(amountStr) || Number(amountStr) <= 0) {
            return { ...baseRow, error: "invalid amount" };
        }
        if (currency !== "USDC" && currency !== "EURC") {
            return { ...baseRow, error: `unsupported currency ${currency}` };
        }
        return {
            ...baseRow,
            amount: parseUnits(amountStr, 6),
            outputCurrency: currency === "EURC" ? EURC_TICKER : USDC_TICKER,
        };
    });
}

export function SenderApp() {
    const { address } = useAccount();
    const chainId = useChainId();
    const { switchChain } = useSwitchChain();
    const onArc = chainId === arcTestnet.id;

    const [rows, setRows] = useState<ParsedRow[]>([]);

    const valid = rows.filter((r) => !r.error);
    const totalsByCurrency = useMemo(() => {
        const acc: Record<string, bigint> = {};
        for (const r of valid) acc[r.currencySymbol] = (acc[r.currencySymbol] ?? 0n) + r.amount;
        return acc;
    }, [valid]);
    const allOneCurrency = valid.length > 0 && new Set(valid.map((r) => r.currencySymbol)).size === 1;

    const { data: fee } = useReadContract({
        abi: batchRegistryAbi,
        address: ADDRESSES.batchRegistry,
        functionName: "registrationFee",
        chainId: arcTestnet.id,
    });
    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        abi: erc20Abi,
        address: ADDRESSES.usdc,
        functionName: "allowance",
        args: address ? [address, ADDRESSES.batchRegistry] : undefined,
        chainId: arcTestnet.id,
    });
    const needsApproval = !!fee && (!allowance || (allowance as bigint) < (fee as bigint));

    const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
    const { isLoading: txPending, isSuccess: txDone } = useWaitForTransactionReceipt({ hash: txHash });

    useEffect(() => { if (txDone) tada(); }, [txDone]);
    useEffect(() => { if (writeError) chord(); }, [writeError]);

    function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        file.text().then((text) => setRows(parseCsv(text)));
    }
    function approve() {
        if (!fee) return;
        writeContract({
            abi: erc20Abi,
            address: ADDRESSES.usdc,
            functionName: "approve",
            args: [ADDRESSES.batchRegistry, fee as bigint],
        });
    }
    function register() {
        if (!allOneCurrency) return;
        const recipients = valid.map((r) => ({
            wallet: r.wallet,
            amount: r.amount,
            outputCurrency: r.outputCurrency,
        }));
        writeContract({
            abi: batchRegistryAbi,
            address: ADDRESSES.batchRegistry,
            functionName: "createBatch",
            args: [recipients],
        });
    }

    return (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ margin: 0 }}>
                Upload a CSV with columns <span className="w7-mono">wallet,amount,currency</span> (currency =
                USDC or EURC), then register the batch on Arc.
            </p>

            {!address && (
                <div role="tooltip" style={{ position: "static", display: "block" }}>
                    Sign in (Start menu) to register batches.
                </div>
            )}
            {address && !onArc && (
                <div role="tooltip" style={{ position: "static", display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ flex: 1 }}>Connected to chain {chainId}; Conduit lives on Arc Testnet (5042002).</span>
                    <button onClick={() => switchChain({ chainId: arcTestnet.id })}>Switch to Arc</button>
                </div>
            )}

            <fieldset>
                <legend>CSV file</legend>
                <input type="file" accept=".csv,text/csv" onChange={onFile} />
            </fieldset>

            {rows.length > 0 && (
                <fieldset>
                    <legend>Recipients — {rows.length} row(s){rows.length !== valid.length ? ` · ${rows.length - valid.length} invalid` : ""}</legend>
                    <table style={{ width: "100%" }}>
                        <thead>
                            <tr>
                                <th>wallet</th>
                                <th style={{ textAlign: "right" }}>amount</th>
                                <th>currency</th>
                                <th>status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i}>
                                    <td className="w7-mono">{r.wallet || "—"}</td>
                                    <td style={{ textAlign: "right" }}>{r.rawAmount}</td>
                                    <td>{r.currencySymbol}</td>
                                    <td>
                                        {r.error
                                            ? <span style={{ color: "#a01010" }}>{r.error}</span>
                                            : <span style={{ color: "#0a7a0a" }}>OK</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </fieldset>
            )}

            {valid.length > 0 && (
                <fieldset>
                    <legend>Summary</legend>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", marginBottom: "10px" }}>
                        <span>Recipients:</span>
                        <span className="w7-mono w7-tabular">
                            {valid.length}
                            {rows.length !== valid.length && (
                                <span style={{ color: "#a01010" }}> ({rows.length - valid.length} invalid)</span>
                            )}
                        </span>
                        {Object.entries(totalsByCurrency).map(([sym, total]) => (
                            <span key={sym} style={{ display: "contents" }}>
                                <span>Total {sym}:</span>
                                <span className="w7-mono w7-tabular">{formatAmount(total, 6, sym)}</span>
                            </span>
                        ))}
                        <span>Registration fee:</span>
                        <span className="w7-mono w7-tabular">{fee != null ? formatAmount(fee as bigint, 6, "USDC") : "…"}</span>
                    </div>
                    {!allOneCurrency && (
                        <div role="tooltip" style={{ position: "static", display: "block", marginBottom: "10px" }}>
                            Mixed currencies in one batch are not supported in v1. Split into separate CSVs.
                        </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "flex-end" }}>
                        {needsApproval && address && onArc && (
                            <button onClick={approve} disabled={isPending || txPending}>
                                {isPending || txPending ? "Submitting…" : `Approve ${formatAmount(fee as bigint, 6, "USDC")}`}
                            </button>
                        )}
                        <button
                            className="default"
                            onClick={register}
                            disabled={!allOneCurrency || valid.length === 0 || needsApproval || isPending || txPending || !address || !onArc}
                        >
                            {isPending || txPending ? "Submitting…" : `Register batch (${valid.length})`}
                        </button>
                    </div>
                    {writeError && (
                        <div role="tooltip" style={{ position: "static", display: "block", marginTop: "10px", background: "#ffe1e1" }}>
                            {writeError.message}
                        </div>
                    )}
                    {txHash && (
                        <div style={{ marginTop: "10px" }}>
                            <p style={{ margin: 0 }}>
                                Tx: <a href={arcScanTx(txHash)} className="w7-mono" target="_blank" rel="noreferrer">{shortenHex(txHash, 10, 6)}</a>
                            </p>
                            {txDone && (
                                <p style={{ marginTop: "4px", color: "#0a7a0a" }}>
                                    Confirmed.{" "}
                                    {needsApproval ? "Approval landed." : "Batch registered."}
                                    {needsApproval && (
                                        <button onClick={() => refetchAllowance()} style={{ marginLeft: "6px" }}>refresh</button>
                                    )}
                                </p>
                            )}
                        </div>
                    )}
                </fieldset>
            )}
        </div>
    );
}
