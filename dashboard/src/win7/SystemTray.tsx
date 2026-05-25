"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { arcTestnet } from "@/lib/chains";

export function SystemTray() {
    const [mounted, setMounted] = useState(false);
    const [now, setNow] = useState<Date>(() => new Date());
    const { address, chainId } = useAccount();
    const onArc = chainId === arcTestnet.id;

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

    return (
        <div className="w7-tray" title={address ? `Connected: ${address}` : "Not connected"}>
            <span
                style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: address && onArc ? "#5fe05f" : address ? "#ffae42" : "#aaa",
                    boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.4)",
                }}
                aria-label="connection"
            />
            <div style={{ display: "flex", flexDirection: "column", lineHeight: "1.1", textAlign: "right" }}>
                <span style={{ fontSize: "11px" }}>{time}</span>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)" }}>{date}</span>
            </div>
        </div>
    );
}
