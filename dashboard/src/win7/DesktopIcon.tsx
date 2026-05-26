"use client";

import { Icon, type IconKey } from "./icons";

interface DesktopIconProps {
    icon: IconKey;
    label: string;
    selected: boolean;
    onSelect: () => void;
    onLaunch: () => void;
}

export function DesktopIcon({ icon, label, selected, onSelect, onLaunch }: DesktopIconProps) {
    return (
        <button
            type="button"
            className={`w7-desktop-icon ${selected ? "selected" : ""}`}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                onLaunch();
            }}
        >
            <Icon icon={icon} size={48} />
            <span className="w7-desktop-icon-label">{label}</span>
        </button>
    );
}
