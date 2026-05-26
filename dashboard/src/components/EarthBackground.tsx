"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";

import { MeteorShower } from "./MeteorShower";

// Dynamically import react-globe.gl with SSR disabled
const Globe = dynamic(() => import("react-globe.gl"), {
    ssr: false,
    loading: () => <div style={{ position: "absolute", inset: 0, background: "#000000" }} />,
}) as any;

export default function EarthBackground() {
    const globeRef = useRef<any>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const sunLightAdded = useRef(false);

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

            // Custom lighting: dim ambient + bright directional "sun" from
            // the bottom-right. Only attach once even if the effect re-fires.
            if (!sunLightAdded.current) {
                const scene = globeRef.current.scene();
                if (scene) {
                    // Dim the existing ambient light(s) to 0.3
                    scene.traverse((obj: any) => {
                        if (obj?.isAmbientLight) {
                            obj.intensity = 0.3;
                        }
                    });

                    // Add a strong sun directional light from the bottom-right
                    const sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
                    sunLight.position.set(2, -1, 1);
                    sunLight.userData.isCustomSun = true;
                    scene.add(sunLight);

                    sunLightAdded.current = true;
                }
            }
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
            {/* Space background — warm nebula tint in the upper-right plus
                the 300-dot starfield from /stars.svg.
                Lifted above the globe canvas (z-index 2) because the globe's
                atmosphere shader paints faint blue alpha across the upper
                viewport which would otherwise mask the dim 1px stars.
                Masked to the top 60% so stars don't sprinkle onto the Earth. */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "radial-gradient(ellipse at 60% 20%, rgba(80,40,10,0.3) 0%, transparent 60%), " +
                        "url('/stars.svg')",
                    backgroundSize: "auto, cover",
                    backgroundRepeat: "no-repeat, no-repeat",
                    pointerEvents: "none",
                    zIndex: 2,
                    maskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 65%)",
                    WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 55%, transparent 65%)",
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
                    atmosphereColor="#3a8fff"
                    atmosphereAltitude={0.18}
                />
            </div>

            {/* Live tx meteor shower — one streak per real Arc-testnet
                transaction, masked above the horizon so it never paints
                on the Earth surface. */}
            <MeteorShower />

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
                    zIndex: 4,
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
