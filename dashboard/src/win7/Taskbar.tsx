"use client";

import { useDesktop } from "./store";
import { ArcLogo } from "./ArcLogo";
import { SystemTray } from "./SystemTray";
import { APPS } from "./apps/registry";
import { Icon } from "./icons";

export function Taskbar() {
    const windows = useDesktop((s) => s.windows);
    const activeId = useDesktop((s) => s.activeId);
    const focus = useDesktop((s) => s.focus);
    const minimize = useDesktop((s) => s.minimize);
    const minimizeAll = useDesktop((s) => s.minimizeAll);
    const startOpen = useDesktop((s) => s.startMenuOpen);
    const toggleStart = useDesktop((s) => s.toggleStartMenu);

    return (
        <div className="w7-taskbar" onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                className="w7-start-orb"
                onClick={(e) => {
                    e.stopPropagation();
                    toggleStart();
                }}
                aria-label={startOpen ? "Close Start menu" : "Open Start menu"}
            >
                <ArcLogo size={22} />
            </button>

            <div style={{ width: "1px", background: "rgba(255,255,255,0.18)", margin: "4px 6px" }} />

            <div style={{ display: "flex", flex: 1, overflow: "hidden", alignItems: "stretch" }}>
                {windows.map((w) => {
                    const app = APPS[w.appId];
                    const isActive = w.id === activeId && !w.minimized;
                    return (
                        <button
                            key={w.id}
                            type="button"
                            className={`w7-task-button ${isActive ? "active" : ""}`}
                            onClick={() => {
                                if (w.minimized || !isActive) focus(w.id);
                                else minimize(w.id);
                            }}
                        >
                            {app && <Icon icon={app.icon} size={18} />}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{w.title}</span>
                        </button>
                    );
                })}
            </div>

            <SystemTray />

            <div
                className="w7-show-desktop"
                onClick={minimizeAll}
                role="button"
                aria-label="Show desktop"
                title="Show desktop"
            />
        </div>
    );
}
