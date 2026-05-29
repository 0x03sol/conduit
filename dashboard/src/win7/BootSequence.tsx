"use client";

import { useEffect, useRef } from "react";

import { useDesktop } from "./store";
import { APPS } from "./apps/registry";

/**
 * BootSequence
 *
 * Runs once per page load (every refresh). Cascades six windows from
 * top-left to bottom-right with a 500ms stagger, ending with Arc TV
 * in the upper-right corner. Window 6 (Arc TV) sets the autoplay flag
 * just before opening so the Wistia iframe starts muted-autoplay
 * playback as soon as it mounts.
 *
 * Each window's CSS open animation (.w7-aero-window @keyframes
 * w7-window-open) plays as it lands — opacity 0→1, scale 0.92→1,
 * translateY 8px→0 over 220ms. That's the Win7 "fade + slight
 * scale/slide" feel the user asked for.
 *
 * Positions are ABSOLUTE pixels — no vw/vh / responsive scaling.
 * They match the reference screenshot at 1919×996 viewport. On
 * narrower screens, windows past x=1095 (Arc TV) will be off-screen;
 * Rnd's bounds="parent" still keeps them draggable back into view.
 *
 * Z-stacking: opening order 1→6 naturally gives My Computer the
 * lowest z and Arc TV the highest, matching the user's spec.
 *
 * The order is also the spec list order. The DESKTOP_ICON_ORDER
 * registry doesn't drive this sequence; this list does.
 */
interface BootStep {
    appId: string;
    /** Absolute x in viewport px. */
    x: number;
    /** Absolute y in viewport px. */
    y: number;
    width: number;
    height: number;
    /** When true, sets arcTvAutoplay=true in the store immediately
     *  before openApp so ArcTvApp picks it up on first mount. */
    autoplayArcTv?: boolean;
}

const SEQUENCE: BootStep[] = [
    // 1. My Computer       — top-left
    { appId: "myComputer", x:   55, y:  50, width: 500, height: 500 },
    // 2. Batch Builder     — slightly right/down
    { appId: "sender",     x:  145, y: 135, width: 500, height: 500 },
    // 3. Settlement Monitor — further right/down
    { appId: "operator",   x:  225, y: 230, width: 500, height: 500 },
    // 4. Arcscan — IE      — center-left
    { appId: "arcscan",    x:  320, y: 345, width: 500, height: 500 },
    // 5. Command Prompt    — lower-left/center
    { appId: "cmd",        x:  445, y: 455, width: 721, height: 414 },
    // 6. Arc TV            — flush to the top-right corner (autoplay)
    { appId: "arcTv",      x: 1206, y:   0, width: 713, height: 476, autoplayArcTv: true },
];

const STAGGER_MS = 500;

export function BootSequence({ enabled }: { enabled: boolean }) {
    const openApp = useDesktop((s) => s.openApp);
    const setArcTvAutoplay = useDesktop((s) => s.setArcTvAutoplay);
    // Strict-mode dev double-mounts useEffect; this guard ensures the
    // sequence only runs once per real mount.
    const ranRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;
        if (ranRef.current) return;
        ranRef.current = true;

        const timeouts: ReturnType<typeof setTimeout>[] = [];

        SEQUENCE.forEach((step, i) => {
            const t = setTimeout(() => {
                if (step.autoplayArcTv) {
                    // Set the flag BEFORE openApp so ArcTvApp's snapshot
                    // at mount picks up the true value.
                    setArcTvAutoplay(true);
                }
                const cfg = APPS[step.appId];
                if (!cfg) return;
                openApp(step.appId, {
                    title: cfg.title,
                    bounds: {
                        x: step.x,
                        y: step.y,
                        width: step.width,
                        height: step.height,
                    },
                });
            }, i * STAGGER_MS);
            timeouts.push(t);
        });

        return () => {
            timeouts.forEach(clearTimeout);
        };
    }, [enabled, openApp, setArcTvAutoplay]);

    return null;
}
