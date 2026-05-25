"use client";

import { useAccount, useBalance, useChainId } from "wagmi";

import { ADDRESSES } from "@/lib/contracts";
import { arcScanAddress, formatAmount, shortenHex } from "@/lib/format";
import { arcTestnet } from "@/lib/chains";
import { Icon } from "../icons";

export function MyComputerApp() {
    const { address } = useAccount();
    const chainId = useChainId();
    const onArc = chainId === arcTestnet.id;
    const { data: usdcBalance } = useBalance({
        address, token: ADDRESSES.usdc, chainId: arcTestnet.id,
    });
    const { data: eurcBalance } = useBalance({
        address, token: ADDRESSES.eurc, chainId: arcTestnet.id,
    });

    return (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <fieldset>
                <legend>Account</legend>
                {address ? (
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", alignItems: "center" }}>
                        <span><Icon icon="wallet" size={18} /></span>
                        <a className="w7-mono" href={arcScanAddress(address)} target="_blank" rel="noreferrer">
                            {shortenHex(address, 10, 8)}
                        </a>
                        <span>Network:</span>
                        <span>
                            {onArc ? "Arc Testnet" : `chain ${chainId}`}
                            {!onArc && <span style={{ color: "#a05500" }}> (wrong chain)</span>}
                        </span>
                    </div>
                ) : (
                    <p>Not connected. Open the Start menu → Sign in.</p>
                )}
            </fieldset>

            <fieldset>
                <legend>Stablecoin balances</legend>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icon icon="money" size={16} /> USDC
                    </span>
                    <span className="w7-mono w7-tabular">
                        {usdcBalance ? formatAmount(usdcBalance.value, usdcBalance.decimals, "USDC") : "—"}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Icon icon="money" size={16} /> EURC
                    </span>
                    <span className="w7-mono w7-tabular">
                        {eurcBalance ? formatAmount(eurcBalance.value, eurcBalance.decimals, "EURC") : "—"}
                    </span>
                </div>
                <p style={{ marginTop: "8px", color: "#445", fontSize: "11px" }}>
                    USDC is also Arc&apos;s native gas token.
                </p>
            </fieldset>

            <fieldset>
                <legend>Conduit contracts (Arc Testnet)</legend>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px" }}>
                    <span>BatchRegistry:</span>
                    <a className="w7-mono" href={arcScanAddress(ADDRESSES.batchRegistry)} target="_blank" rel="noreferrer">
                        {shortenHex(ADDRESSES.batchRegistry, 10, 8)}
                    </a>
                    <span>BatchRouter:</span>
                    <a className="w7-mono" href={arcScanAddress(ADDRESSES.batchRouter)} target="_blank" rel="noreferrer">
                        {shortenHex(ADDRESSES.batchRouter, 10, 8)}
                    </a>
                </div>
            </fieldset>
        </div>
    );
}
