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
            minWidth={300}
            minHeight={180}
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
                className={`window glass ${isActive ? "active" : ""}`}
                style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
            >
                <div
                    className="title-bar"
                    onDoubleClick={() => toggleMaximize(win.id)}
                    style={{ display: "flex", alignItems: "center" }}
                >
                    {icon && <Icon icon={icon} size={16} style={{ marginLeft: "4px", marginRight: "4px" }} />}
                    <div className="title-bar-text" style={{ flex: 1 }}>{win.title}</div>
                    <div className="title-bar-controls">
                        <button
                            type="button"
                            aria-label="Minimize"
                            onClick={(e) => { e.stopPropagation(); minimize(win.id); }}
                        />
                        <button
                            type="button"
                            aria-label={win.maximized ? "Restore" : "Maximize"}
                            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
                        />
                        <button
                            type="button"
                            aria-label="Close"
                            onClick={(e) => { e.stopPropagation(); close(win.id); }}
                        />
                    </div>
                </div>
                <div
                    className="window-body has-space"
                    style={{
                        flex: 1,
                        overflow: "auto",
                        margin: 0,
                        background: "rgba(255, 255, 255, 0.92)",
                    }}
                >
                    {children}
                </div>
            </div>
        </Rnd>
    );
}
