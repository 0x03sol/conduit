"use client";

import { Icon } from "../icons";

export function RecycleBinApp() {
    return (
        <div style={{
            padding: "20px",
            textAlign: "center",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
        }}>
            <Icon icon="recycleBin" size={64} />
            <h2 style={{ fontSize: "14px", fontWeight: "bold", margin: 0 }}>
                The Recycle Bin is empty.
            </h2>
            <p style={{ maxWidth: "320px", color: "#445", lineHeight: 1.5 }}>
                In a future build, reverted or expired batches land here.
                Conduit&apos;s Phase 2.3 contracts haven&apos;t produced any reverts —
                every settled batch landed cleanly.
            </p>
        </div>
    );
}
