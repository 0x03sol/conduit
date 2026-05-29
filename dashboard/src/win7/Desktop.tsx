"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

import { useDesktop } from "./store";
import { Win7Window } from "./Window";
import { DesktopIcon } from "./DesktopIcon";
import { Taskbar } from "./Taskbar";
import { StartMenu } from "./StartMenu";
import { APPS, DESKTOP_ICON_ORDER } from "./apps/registry";
import EarthBackground from "../components/EarthBackground";
import { ArcReadout } from "../components/ArcReadout";
import { OnboardingTour } from "../components/OnboardingTour";
import { BootSequence } from "./BootSequence";

interface DesktopProps {
    autoOpen?: string;
}

export function Desktop({ autoOpen }: DesktopProps) {
    const windows = useDesktop((s) => s.windows);
    const closeStartMenu = useDesktop((s) => s.closeStartMenu);
    const openApp = useDesktop((s) => s.openApp);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (autoOpen && APPS[autoOpen]) {
            openApp(autoOpen, {
                title: APPS[autoOpen]!.title,
                bounds: APPS[autoOpen]!.defaultSize,
            });
        }
    }, [autoOpen, openApp]);

    const handleBackgroundClick = () => {
        closeStartMenu();
        setSelectedId(null);
    };

    const handleBackgroundKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        // Escape from anywhere on the desktop closes the start menu and
        // clears the selected icon — same behaviour as a background click,
        // but reachable for keyboard users. Other keys bubble normally so
        // typing inside windows is unaffected.
        if (e.key === "Escape") {
            handleBackgroundClick();
        }
    };

    return (
        <div
            onClick={handleBackgroundClick}
            onKeyDown={handleBackgroundKeyDown}
            tabIndex={-1}
            style={{
                position: "fixed",
                inset: 0,
                overflow: "hidden",
            }}
        >
            {/* Live 3D WebGL Earth screensaver background */}
            <EarthBackground />

            {/* Desktop icons */}
            <div
                style={{
                    position: "absolute",
                    top: "12px",
                    left: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    zIndex: 1,
                }}
            >
                {DESKTOP_ICON_ORDER.map((id) => {
                    const app = APPS[id];
                    if (!app) return null;
                    return (
                        <DesktopIcon
                            key={id}
                            icon={app.icon}
                            label={(app.iconLabel ?? app.title).replace(/\.exe$/, "")}
                            selected={selectedId === id}
                            onSelect={() => setSelectedId(id)}
                            onLaunch={() => {
                                setSelectedId(null);
                                openApp(id, {
                                    title: app.title,
                                    bounds: app.defaultSize,
                                });
                            }}
                        />
                    );
                })}
            </div>

            {/* Window viewport (above wallpaper, below taskbar) */}
            <div style={{ position: "absolute", inset: 0, bottom: "40px" }}>
                {windows.map((w) => {
                    const app = APPS[w.appId];
                    if (!app) return null;
                    const Body = app.component;
                    return (
                        <Win7Window key={w.id} id={w.id} icon={app.icon}>
                            <Body />
                        </Win7Window>
                    );
                })}
            </div>

            <Taskbar />
            <StartMenu />
            <ArcReadout />
            <OnboardingTour />
            <BootSequence enabled={!autoOpen} />
        </div>
    );
}
