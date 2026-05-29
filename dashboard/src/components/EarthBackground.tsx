"use client";

import { useEffect, useState } from "react";

import { MeteorShower } from "./MeteorShower";

/**
 * EarthBackground
 *
 * Flat-image desktop wallpaper: a cinematic Earth-from-orbit photograph
 * (stars + Milky Way + atmospheric blue limb baked in) covers the entire
 * viewport. The MeteorShower canvas floats above so live Arc-testnet tx
 * streaks still rain across the upper-half sky. A small Arc Λ emblem
 * floats in the upper-center sky with a soft glow and a 4s ease-in-out
 * vertical bob.
 *
 * Trade-offs vs the previous WebGL globe:
 *   • Pro: zero WebGL cost, instant first paint, sharp text rendering on
 *     low-end devices, cinematic AI-art aesthetic.
 *   • Con: no live rotation. The Earth is a frozen camera angle.
 *
 * The observatory readout (ArcReadout), Win7 taskbar, and any open
 * windows are layered over this background by Desktop.tsx (z >= 100).
 */
export default function EarthBackground() {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                background: "#000000",
                zIndex: 0,
                pointerEvents: "none",
            }}
        >
            {/* Wallpaper layer — Earth-from-orbit photograph filling the
                viewport. background-size: cover preserves aspect ratio and
                slightly crops left/right (or top/bottom on ultrawide) to
                fully fill the screen. */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: "url('/wallpaper.jpg')",
                    backgroundSize: "cover",
                    backgroundPosition: "center center",
                    backgroundRepeat: "no-repeat",
                    zIndex: 1,
                }}
            />

            {/* Arc brand mark — inline SVG Λ + typing 'Arc Conduit'
                wordmark. The text types itself out once on mount with a
                blinking caret, then settles. Sits in the gap between the
                two top windows after the boot cascade lands, so it stays
                visible even with all windows open. */}
            <div
                aria-hidden
                style={{
                    position: "absolute",
                    top: "55px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 3,
                    display: "flex",
                    alignItems: "center",
                    gap: "18px",
                    pointerEvents: "none",
                    userSelect: "none",
                    filter: "drop-shadow(0 0 22px rgba(255, 255, 255, 0.55))",
                }}
            >
                <svg
                    width="84"
                    height="84"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    {/* Λ — Arc arch: two thick legs joined by a rounded apex */}
                    <path
                        d="M15 85C15 50 35 15 50 15C65 15 85 50 85 85C77 85 70 85 62 85C62 60 56 46 50 46C44 46 38 60 38 85C30 85 23 85 15 85Z"
                        fill="#FFFFFF"
                    />
                </svg>
                <ArcTypingWordmark />
            </div>

            {/* Live tx meteor shower — one streak per real Arc-testnet
                transaction, masked above the horizon (handled inside
                MeteorShower) so it never paints on the Earth surface. */}
            <MeteorShower />
        </div>
    );
}


/**
 * ArcTypingWordmark
 *
 * Types the brand wordmark "Arc Conduit" once on mount, then shows a
 * blinking caret. Bigger weight + tighter tracking + a subtle text
 * shadow so the white reads cleanly over the wallpaper without the old
 * floating bob (which made body copy in the windows below feel jittery).
 */
function ArcTypingWordmark() {
    const FULL = "Arc Conduit";
    const [n, setN] = useState(0);

    useEffect(() => {
        if (n >= FULL.length) return;
        const t = setTimeout(() => setN((v) => v + 1), 95); // ~1.05s total
        return () => clearTimeout(t);
    }, [n]);

    return (
        <span
            style={{
                color: "#FFFFFF",
                fontSize: "72px",
                fontWeight: 600,
                letterSpacing: "-2px",
                fontFamily: '"Segoe UI", sans-serif',
                lineHeight: 1,
                textShadow:
                    "0 2px 4px rgba(0, 0, 0, 0.45), 0 0 22px rgba(255, 255, 255, 0.25)",
                whiteSpace: "pre",
            }}
        >
            {FULL.slice(0, n)}
            {n < FULL.length && (
                <span
                    aria-hidden
                    style={{
                        display: "inline-block",
                        width: "0.05em",
                        height: "0.85em",
                        background: "#ffffff",
                        marginLeft: "0.08em",
                        verticalAlign: "text-bottom",
                        boxShadow: "0 0 8px rgba(255,255,255,0.7)",
                        animation: "arc-wordmark-caret 1s step-end infinite",
                    }}
                />
            )}
        </span>
    );
}
