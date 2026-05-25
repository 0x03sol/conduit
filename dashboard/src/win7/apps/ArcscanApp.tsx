"use client";

import { useState } from "react";

import { Icon } from "../icons";

const PRESETS = [
    { label: "Arc Testnet Explorer (home)",  href: "https://testnet.arcscan.app/" },
    { label: "BatchRegistry contract",       href: "https://testnet.arcscan.app/address/0x823b34D7FBa61628cE3e665F86f715e823657A17" },
    { label: "BatchRouter contract",         href: "https://testnet.arcscan.app/address/0x1a8F8B0aA5fe50c3c9B48E5aCA56aBe2CE52452f" },
    { label: "CCTPHookReceiver contract",    href: "https://testnet.arcscan.app/address/0xe495183df2035aB5882bC2957ec0f94B2F03e22b" },
    { label: "Last settled batch tx",        href: "https://testnet.arcscan.app/tx/0xfc746072442e2" },
];

export function ArcscanApp() {
    const [url, setUrl] = useState(PRESETS[0]!.href);

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
