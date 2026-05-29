"use client";

import { useDesktop } from "../win7/store";
import { APPS } from "../win7/apps/registry";

/**
 * HowItWorksButton
 *
 * Compact text button rendered inline in the Win7 SystemTray, to the
 * left of the block / gwei / txs strip. Clicking it opens the Notepad
 * "How It Works" walkthrough; if the window is already open, it is
 * focused and brought to front (handled by openApp deduplication in
 * the store).
 *
 * Styling matches the tray's dark-glassy background — small white text
 * with a subtle hover highlight, no border (the trailing right-side
 * divider is supplied by the parent stats strip on its left edge).
 */
export function HowItWorksButton() {
    const openApp = useDesktop((s) => s.openApp);

    const handleClick = () => {
        const cfg = APPS.notepad;
        if (!cfg) return;
        openApp("notepad", { title: cfg.title, bounds: cfg.defaultSize });
    };

    return (
        <button
            type="button"
            className="conduit-tray-link"
            onClick={handleClick}
            title="Open the How It Works walkthrough"
            aria-label="Open the How It Works walkthrough"
        >
            How It Works
        </button>
    );
}
