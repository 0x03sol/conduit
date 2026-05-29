"use client";

import { Rnd } from "react-rnd";
import type { ReactNode } from "react";

import { useDesktop } from "./store";
import { Icon, type IconKey } from "./icons";

interface WindowProps {
    id: string;
    icon?: IconKey;
    children: ReactNode;
}

/**
 * A draggable, resizable Win7 window.
 * Chrome is provided by 7.css (.window .title-bar etc), wrapped in react-rnd.
 */
export function Win7Window({ id, icon, children }: WindowProps) {
    const win = useDesktop((s) => s.windows.find((w) => w.id === id));
    const activeId = useDesktop((s) => s.activeId);
    const focus = useDesktop((s) => s.focus);
    const close = useDesktop((s) => s.close);
    const minimize = useDesktop((s) => s.minimize);
    const toggleMaximize = useDesktop((s) => s.toggleMaximize);
    const setBounds = useDesktop((s) => s.setBounds);

    if (!win || win.minimized) return null;
    const isActive = win.id === activeId;

    return (
        <Rnd
            size={{ width: win.bounds.width, height: win.bounds.height }}
            position={{ x: win.bounds.x, y: win.bounds.y }}
            minWidth={240}
            minHeight={140}
            bounds="parent"
            dragHandleClassName="title-bar"
            disableDragging={win.maximized}
            enableResizing={!win.maximized}
            onDragStop={(_, d) => setBounds(win.id, { ...win.bounds, x: d.x, y: d.y })}
            onResizeStop={(_, __, ref, ___, pos) =>
                setBounds(win.id, {
                    x: pos.x,
                    y: pos.y,
                    width: ref.offsetWidth,
                    height: ref.offsetHeight,
                })
            }
            style={{ zIndex: win.zIndex }}
            onMouseDown={() => !isActive && focus(win.id)}
        >
            <div
                className={`w7-aero-window ${isActive ? "active" : ""}`}
                style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}
            >
                <div
                    className="title-bar"
                    onDoubleClick={() => toggleMaximize(win.id)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        height: "22px",
                        cursor: "default",
                        userSelect: "none",
                        padding: "0 2px",
                        marginBottom: "4px"
                    }}
                >
                    {icon && <Icon icon={icon} size={16} style={{ marginRight: "4px" }} />}
                    <div className="w7-aero-title-text" style={{ flex: 1 }}>{win.title}</div>
                    <div className="w7-aero-controls">
                        <button
                            type="button"
                            className="w7-aero-btn w7-aero-btn-min"
                            onClick={(e) => { e.stopPropagation(); minimize(win.id); }}
                            aria-label="Minimize"
                        />
                        <button
                            type="button"
                            className="w7-aero-btn w7-aero-btn-max"
                            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
                            aria-label={win.maximized ? "Restore" : "Maximize"}
                        />
                        <button
                            type="button"
                            className="w7-aero-btn w7-aero-btn-close"
                            onClick={(e) => { e.stopPropagation(); close(win.id); }}
                            aria-label="Close"
                        />
                    </div>
                </div>
                <div className="w7-aero-client">
                    {children}
                </div>
            </div>
        </Rnd>
    );
}
