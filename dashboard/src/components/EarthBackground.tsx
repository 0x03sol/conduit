"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import react-globe.gl with SSR disabled
const Globe = dynamic(() => import("react-globe.gl"), {
    ssr: false,
    loading: () => <div style={{ position: "absolute", inset: 0, background: "#000000" }} />,
}) as any;

export default function EarthBackground() {
    const globeRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    useEffect(() => {
        // Set dimensions once we are client-side
        setDimensions({
            width: window.innerWidth,
            height: window.innerHeight,
        });

        const handleResize = () => {
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        if (globeRef.current) {
            const controls = globeRef.current.controls();
            if (controls) {
                controls.autoRotate = true;
                controls.autoRotateSpeed = 0.25;
                controls.enableZoom = false;
                controls.enablePan = false;
            }
            // High-orbit altitude — full Earth disk visible inside the canvas,
            // so the limb (Earth's edge against space) is renderable. We then
            // crop with CSS positioning to show only the upper horizon arc.
            globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 1.8 });
        }
    }, [globeRef.current]);

    // Square canvas at 2× viewport width — keeps the sphere round and makes
    // the rendered globe massive (so the curvature looks gentle, like the
    // reference photo from low orbit).
    const globeSize = dimensions.width * 2;

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
            {/* Static starfield + milky-way wash — pinpoint white dots
                evoke the deep-space backdrop from the reference shot. */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: [
                        "radial-gradient(1px 1px at 12% 8%, rgba(255,255,255,0.85), transparent 50%)",
                        "radial-gradient(1px 1px at 24% 22%, rgba(255,255,255,0.55), transparent 50%)",
                        "radial-gradient(2px 2px at 38% 14%, rgba(255,255,255,0.95), transparent 50%)",
                        "radial-gradient(1px 1px at 52% 6%, rgba(255,255,255,0.6), transparent 50%)",
                        "radial-gradient(1px 1px at 62% 28%, rgba(255,255,255,0.75), transparent 50%)",
                        "radial-gradient(2px 2px at 74% 12%, rgba(255,255,255,0.9), transparent 50%)",
                        "radial-gradient(1px 1px at 84% 24%, rgba(255,255,255,0.55), transparent 50%)",
                        "radial-gradient(1px 1px at 92% 8%, rgba(255,255,255,0.7), transparent 50%)",
                        "radial-gradient(1px 1px at 6% 32%, rgba(255,255,255,0.5), transparent 50%)",
                        "radial-gradient(1px 1px at 44% 36%, rgba(255,255,255,0.65), transparent 50%)",
                        "radial-gradient(1px 1px at 68% 38%, rgba(255,255,255,0.5), transparent 50%)",
                        "radial-gradient(1px 1px at 18% 44%, rgba(255,255,255,0.45), transparent 50%)",
                        "radial-gradient(2px 2px at 88% 40%, rgba(255,255,255,0.85), transparent 50%)",
                        "radial-gradient(ellipse 60% 25% at 55% 18%, rgba(140,110,160,0.10), transparent 70%)",
                        "radial-gradient(ellipse 45% 18% at 30% 12%, rgba(120,140,180,0.08), transparent 70%)",
                    ].join(","),
                    pointerEvents: "none",
                }}
            />

            {/* Massive globe — canvas is 2× viewport width with the disk
                anchored toward its middle. Positioning the canvas with a
                positive top value pushes it down so the disk's upper limb
                arc lands at viewport mid-height, leaving black starry space
                above for the Arc wordmark. */}
            <div
                style={{
                    position: "absolute",
                    width: `${globeSize}px`,
                    height: `${globeSize}px`,
                    left: "50%",
                    top: "-20%",
                    transform: "translateX(-50%)",
                    pointerEvents: "none",
                    zIndex: 1,
                }}
            >
                <Globe
                    ref={globeRef}
                    width={globeSize}
                    height={globeSize}
                    globeImageUrl="/earth-day.jpg"
                    bumpImageUrl="/earth-bump.png"
                    nightImageUrl="/earth-night.jpg"
                    backgroundImageUrl="" // black space; stars are drawn above
                    showAtmosphere={true}
                    atmosphereColor="rgb(120, 180, 255)"
                    atmosphereAltitude={0.22}
                />
            </div>

            {/* Brand overlay — clean white Arc arch (Λ) + "Arc" wordmark in
                the black sky above the horizon. No spiral, no circle. */}
            <div
                style={{
                    position: "absolute",
                    top: "30%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex",
                    alignItems: "center",
                    gap: "20px",
                    zIndex: 2,
                    pointerEvents: "none",
                    userSelect: "none",
                }}
            >
                <svg
                    width="84"
                    height="84"
                    viewBox="0 0 100 100"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ filter: "drop-shadow(0 0 18px rgba(255, 255, 255, 0.45))" }}
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
                        fontFamily: "Segoe UI, sans-serif",
                        textShadow: "0 0 18px rgba(255, 255, 255, 0.4)",
                        lineHeight: 1,
                    }}
                >
                    Arc
                </span>
            </div>
        </div>
    );
}
