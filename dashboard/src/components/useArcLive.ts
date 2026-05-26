"use client";

import { useEffect, useRef, useState } from "react";

import {
    getRate,
    getStatus,
    nextTxHash,
    subscribe,
    subscribeStatus,
    type Status,
    type TickEvent,
    type TxHashEntry,
} from "@/lib/arcLiveStream";

/**
 * Subscribe a stable callback to live tick events. The callback is held in
 * a ref so the singleton WS only registers one listener per component
 * mount, regardless of render churn.
 */
export function useArcLiveTicks(onTick: (e: TickEvent) => void): void {
    const cbRef = useRef(onTick);
    cbRef.current = onTick;
    useEffect(() => subscribe((e) => cbRef.current(e)), []);
}

/**
 * Returns the current rolling tx/s rate and connection status. Re-renders
 * roughly every second (driven by ticks) plus on any status change. We
 * sample `getRate()` on each tick rather than maintaining a separate
 * timer — the rate naturally updates whenever the stream is alive, and
 * stays put when it isn't (which is the visually-correct behaviour).
 */
export function useArcLive(): { rate: number; status: Status } {
    const [snap, setSnap] = useState<{ rate: number; status: Status }>(() => ({
        rate: getRate(),
        status: getStatus(),
    }));

    useEffect(() => {
        const off1 = subscribe(() => {
            setSnap({ rate: getRate(), status: getStatus() });
        });
        const off2 = subscribeStatus((s) => {
            setSnap({ rate: getRate(), status: s });
        });
        // Also tick once a second to relax the rate when txs slow down
        const slowTimer = setInterval(() => {
            setSnap((prev) => {
                const newRate = getRate();
                if (Math.abs(newRate - prev.rate) < 0.05 && prev.status === getStatus()) {
                    return prev;
                }
                return { rate: newRate, status: getStatus() };
            });
        }, 1000);
        return () => {
            off1();
            off2();
            clearInterval(slowTimer);
        };
    }, []);

    return snap;
}

/** Pop the next available tx hash entry from the live queue, or null. */
export function popArcTxHash(): TxHashEntry | null {
    return nextTxHash();
}
