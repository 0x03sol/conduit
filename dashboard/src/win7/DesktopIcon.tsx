"use client";

import { useState } from "react";

import { Icon, type IconKey } from "./icons";

interface DesktopIconProps {
    icon: IconKey;
    label: string;
    onLaunch: () => void;
}

export function DesktopIcon({ icon, label, onLaunch }: DesktopIconProps) {
    const [selected, setSelected] = useState(false);

    return (
        <button
            type="button"
            className={`w7-desktop-icon ${selected ? "selected" : ""}`}
            onClick={(e) => {
                e.stopPropagation();
                setSelected(true);
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                setSelected(false);
                onLaunch();
            }}
            onBlur={() => setSelected(false)}
        >
            <Icon icon={icon} size={48} />
            <span className="w7-desktop-icon-label">{label}</span>
        </button>
    );
}
