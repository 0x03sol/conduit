"use client";

import { useMemo, useState } from "react";
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
        if (!isAddress(wallet)) {
            return { ...baseRow, error: "invalid address" };
        }
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

export default function SenderPage() {
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

    // Read fee + allowance on Arc.
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
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-medium">Sender</h1>
                <p className="text-sm text-ink-soft mt-1">
                    Upload a CSV with columns <span className="font-mono">wallet,amount,currency</span> (currency = USDC or EURC), then register the batch on Arc.
                </p>
            </div>

            {!address && (
                <div className="rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                    Sign in (top-right) to register batches.
                </div>
            )}

            {address && !onArc && (
                <div className="rounded border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 flex items-center gap-3">
                    <span>Connected to chain {chainId}; Conduit lives on Arc Testnet (5042002).</span>
                    <button
                        onClick={() => switchChain({ chainId: arcTestnet.id })}
                        className="px-3 py-1 bg-ink text-paper rounded text-xs"
                    >
                        Switch to Arc
                    </button>
                </div>
            )}

            <div className="space-y-3">
                <label className="block text-sm">
                    <span className="block mb-1 text-xs uppercase tracking-wide text-ink-soft">CSV</span>
                    <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={onFile}
                        className="block file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-ink file:text-paper file:text-sm"
                    />
                </label>
            </div>

            {rows.length > 0 && (
                <div className="rounded-md border border-border overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm tabular">
                        <thead className="bg-paper-soft text-xs text-ink-soft/80">
                            <tr>
                                <th className="text-left px-4 py-2 font-normal">wallet</th>
                                <th className="text-right px-4 py-2 font-normal">amount</th>
                                <th className="text-left px-4 py-2 font-normal">currency</th>
                                <th className="text-left px-4 py-2 font-normal">status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className="border-t border-border">
                                    <td className="px-4 py-2 font-mono text-xs">{r.wallet || "—"}</td>
                                    <td className="px-4 py-2 text-right">{r.rawAmount}</td>
                                    <td className="px-4 py-2">{r.currencySymbol}</td>
                                    <td className="px-4 py-2">
                                        {r.error ? <span className="text-red-700">{r.error}</span> : <span className="text-green-700">OK</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {valid.length > 0 && (
                <div className="rounded-md border border-border bg-paper-soft px-5 py-4 space-y-1 text-sm">
                    <p>
                        <span className="text-ink-soft">recipients:</span>{" "}
                        <span className="font-mono">{valid.length}</span>
                        {rows.length !== valid.length && (
                            <span className="text-red-700"> ({rows.length - valid.length} invalid)</span>
                        )}
                    </p>
                    {Object.entries(totalsByCurrency).map(([sym, total]) => (
                        <p key={sym}>
                            <span className="text-ink-soft">total {sym}:</span>{" "}
                            <span className="font-mono">{formatAmount(total, 6, sym)}</span>
                        </p>
                    ))}
                    {!allOneCurrency && (
                        <p className="text-red-700 text-xs">
                            Mixed currencies in one batch are not supported in v1. Split into separate CSVs.
                        </p>
                    )}
                    <p className="text-xs">
                        <span className="text-ink-soft">registration fee:</span>{" "}
                        <span className="font-mono">{fee != null ? formatAmount(fee as bigint, 6, "USDC") : "…"}</span>
                    </p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
                {needsApproval && address && onArc && (
                    <button
                        onClick={approve}
                        disabled={isPending || txPending}
                        className="px-4 py-2 border border-border rounded text-sm hover:border-signal disabled:opacity-50"
                    >
                        {isPending || txPending ? "Submitting…" : `Approve ${formatAmount(fee as bigint, 6, "USDC")} for registry`}
                    </button>
                )}
                <button
                    onClick={register}
                    disabled={!allOneCurrency || valid.length === 0 || needsApproval || isPending || txPending || !address || !onArc}
                    className="px-4 py-2 bg-ink text-paper rounded text-sm hover:bg-ink-soft disabled:opacity-50"
                >
                    {isPending || txPending ? "Submitting…" : `Register batch (${valid.length} recipients)`}
                </button>
            </div>

            {writeError && <p className="text-sm text-red-700">{writeError.message}</p>}
            {txHash && (
                <div className="text-sm space-y-1">
                    <p>
                        Tx:{" "}
                        <a className="font-mono text-signal underline" href={arcScanTx(txHash)} target="_blank" rel="noreferrer">
                            {shortenHex(txHash, 10, 6)}
                        </a>
                    </p>
                    {txDone && (
                        <p className="text-green-700">
                            Confirmed. {needsApproval ? "Approval landed — refreshing allowance." : "Batch registered. Refresh the operator view to see it appear."}
                            {needsApproval && (
                                <button onClick={() => refetchAllowance()} className="ml-2 underline text-signal">refresh</button>
                            )}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
