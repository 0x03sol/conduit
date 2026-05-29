"use client";

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

            {/* Arc brand mark — inline SVG Λ + "Arc" wordmark in pure
                white, with a unified soft glow on the parent (drop-shadow
                filter spans both the SVG and the text glyphs). Sits in
                the gap between the two top windows after the boot
                cascade lands, so it stays visible even with all windows
                open.

                The 4s ease-in-out alternate vertical bob (defined in
                globals.css as @keyframes arc-emblem-float) keeps the
                "floating in zero-G" feel from the previous img-based
                emblem. */}
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
                    filter: "drop-shadow(0 0 18px rgba(255, 255, 255, 0.45))",
                    animation:
                        "arc-emblem-float 4s ease-in-out infinite alternate",
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
                <span
                    style={{
                        color: "#FFFFFF",
                        fontSize: "72px",
                        fontWeight: 500,
                        letterSpacing: "-1.5px",
                        fontFamily: '"Segoe UI", sans-serif',
                        lineHeight: 1,
                    }}
                >
                    Arc
                </span>
            </div>

            {/* Live tx meteor shower — one streak per real Arc-testnet
                transaction, masked above the horizon (handled inside
                MeteorShower) so it never paints on the Earth surface. */}
            <MeteorShower />
        </div>
    );
}
