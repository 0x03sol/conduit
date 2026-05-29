"use client";

import { useEffect, useState } from "react";

import { useDesktop } from "../store";
import { Icon } from "../icons";

const PRESETS = [
    { label: "Arc Testnet Explorer (home)",  href: "https://testnet.arcscan.app/" },
    { label: "BatchRegistry contract",       href: "https://testnet.arcscan.app/address/0x34705cF46Ddf9f3cE53f5492B6376678BE62F0fc" },
    { label: "BatchRouter contract",         href: "https://testnet.arcscan.app/address/0x6eD720FDF5c28cF8895A8049Fe13AF1384d82d20" },
    { label: "CCTPHookReceiver contract",    href: "https://testnet.arcscan.app/address/0xAe225c9F39664Ff01D11dA9cD29452a2bE0E8FE3" },
    { label: "Last settled batch tx",        href: "https://testnet.arcscan.app/tx/0xfc746072442e2" },
];

export function ArcscanApp() {
    const arcscanTargetUrl = useDesktop((s) => s.arcscanTargetUrl);
    const setArcscanTarget = useDesktop((s) => s.setArcscanTarget);
    const [url, setUrl] = useState<string>(() => arcscanTargetUrl ?? PRESETS[0]!.href);

    // When a meteor (or any other caller) sets a new deep-link target,
    // sync it into the address bar and clear the store entry so we don't
    // re-trigger on every focus.
    useEffect(() => {
        if (arcscanTargetUrl) {
            setUrl(arcscanTargetUrl);
            setArcscanTarget(null);
        }
    }, [arcscanTargetUrl, setArcscanTarget]);

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <ul role="menubar" className="can-hover" style={{ borderRadius: 0 }}>
                <li role="menuitem" tabIndex={0}>File</li>
                <li role="menuitem" tabIndex={0}>Edit</li>
                <li role="menuitem" tabIndex={0}>View</li>
                <li role="menuitem" tabIndex={0}>Favorites</li>
                <li role="menuitem" tabIndex={0}>Help</li>
            </ul>
            <div style={{ display: "flex", gap: "6px", padding: "6px 8px", borderBottom: "1px solid #aaa", alignItems: "center" }}>
                <span>Address:</span>
                <input
                    type="text"
                    aria-label="URL address bar"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w7-mono"
                    style={{ flex: 1 }}
                />
                <a href={url} target="_blank" rel="noreferrer">
                    <button type="button" className="default" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Icon icon="arcscan" size={14} /> Go
                    </button>
                </a>
            </div>
            <div style={{ padding: "16px", flex: 1, overflow: "auto", background: "#fff", color: "#000" }}>
                <p style={{ marginBottom: "12px", color: "#445" }}>
                    Browsers prevent embedding arcscan in an iframe. Pick a destination below
                    to open in a new tab.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {PRESETS.map((p) => (
                        <li key={p.href} style={{ padding: "4px 0", borderBottom: "1px dotted #cdd" }}>
                            <a
                                href={p.href}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setUrl(p.href)}
                                style={{ display: "flex", gap: "8px", alignItems: "center", padding: "2px 4px" }}
                            >
                                <Icon icon="arcscan" size={16} />
                                {p.label}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
