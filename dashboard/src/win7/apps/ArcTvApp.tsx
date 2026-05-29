"use client";

import { useEffect, useState } from "react";

import { useDesktop } from "../store";

/**
 * Arc TV — Media Player
 *
 * Win7-styled "media player" window. The community.arc.io page that
 * hosts this video ships `X-Frame-Options: SAMEORIGIN` + a strict
 * `frame-ancestors 'self'` CSP, so we cannot iframe the page itself —
 * instead we embed the underlying Wistia video, which is publicly
 * embeddable, and link out to the community page for full context.
 *
 * Autoplay: when BootSequence sets `arcTvAutoplay = true` in the store
 * just before opening this window, we append `&autoPlay=true&muted=true`
 * to the Wistia URL on first mount (browsers require muted for autoplay).
 * The flag is one-shot — cleared after read so manual reopens don't
 * autoplay.
 */
const WISTIA_BASE = "https://fast.wistia.net/embed/iframe";
const VIDEO_ID = "83h8oivd8o";
const VIDEO_TITLE = "VC Pitch Arc Studio";
const VIDEO_SUBTITLE = "Circle Developer Grants — From Idea to Funded";
const PAGE_URL =
    "https://community.arc.io/home/videos/circle-developer-grants-from-idea-to-funded-2026-05-14?wvideo=83h8oivd8o";

function VideoFrame({ src, title }: { src: string; title: string }) {
    return (
        <iframe
            src={src}
            title={title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            // @ts-expect-error – legacy Wistia attribute, still honoured
            allowtransparency="true"
            frameBorder={0}
            scrolling="no"
            style={{
                width: "100%",
                height: "380px",
                display: "block",
                background: "#000",
                border: "1px solid #9bbcd9",
            }}
        />
    );
}

export function ArcTvApp() {
    // Snapshot autoplay flag once at mount; clear it immediately so a
    // manual reopen later doesn't autoplay.
    // NOTE: unmuted autoplay. Browser autoplay policies (Chrome/Safari)
    // block sound-on autoplay unless the page already has a user gesture
    // or sufficient media-engagement score. On a cold first load the
    // video may start muted anyway and the user taps the Wistia unmute
    // control; on revisits with engagement it plays with sound.
    const [autoplayParams] = useState(() =>
        useDesktop.getState().arcTvAutoplay ? "&autoPlay=true&muted=false" : "",
    );
    const setArcTvAutoplay = useDesktop((s) => s.setArcTvAutoplay);
    useEffect(() => {
        if (autoplayParams) setArcTvAutoplay(false);
    }, [autoplayParams, setArcTvAutoplay]);

    return (
        <div
            style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "#ffffff",
                color: "#000000",
                fontFamily: '"Segoe UI", Selawik, Tahoma, Verdana, sans-serif',
                fontSize: "11px",
            }}
        >
            {/* Classic Win7 menubar */}
            <ul
                role="menubar"
                className="can-hover"
                style={{
                    borderRadius: 0,
                    flex: "0 0 auto",
                    fontSize: "11px",
                }}
            >
                <li role="menuitem" tabIndex={0}>File</li>
                <li role="menuitem" tabIndex={0}>View</li>
                <li role="menuitem" tabIndex={0}>Play</li>
                <li role="menuitem" tabIndex={0}>Tools</li>
                <li role="menuitem" tabIndex={0}>Help</li>
            </ul>

            {/* Scrollable content area */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "10px 12px 14px",
                }}
            >
                <div>
                    <h2
                        style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            margin: "0 0 2px",
                            color: "#1e395b",
                            fontFamily: "inherit",
                        }}
                    >
                        {VIDEO_TITLE}
                    </h2>
                    <div
                        style={{
                            fontSize: "11px",
                            color: "#777",
                            margin: "0 0 8px",
                        }}
                    >
                        {VIDEO_SUBTITLE}
                    </div>

                    <VideoFrame
                        src={`${WISTIA_BASE}/${VIDEO_ID}?videoFoam=true${autoplayParams}`}
                        title={VIDEO_TITLE}
                    />

                    <p
                        style={{
                            marginTop: "10px",
                            marginBottom: 0,
                            fontSize: "11px",
                            lineHeight: 1.4,
                            color: "#000",
                            fontFamily: "inherit",
                        }}
                    >
                        <a
                            href={PAGE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: "#1e6bd6",
                                textDecoration: "underline",
                            }}
                        >
                            Watch on community.arc.io →
                        </a>
                    </p>
                </div>
            </div>

            {/* Win7 status bar at the bottom */}
            <div
                style={{
                    flex: "0 0 auto",
                    borderTop: "1px solid #aac4dc",
                    background:
                        "linear-gradient(180deg, #f3f7fc 0%, #d8e6f6 100%)",
                    padding: "3px 8px",
                    fontSize: "10px",
                    color: "#1e395b",
                    display: "flex",
                    justifyContent: "space-between",
                }}
            >
                <span>Now playing: {VIDEO_TITLE}</span>
                <span>Wistia · {VIDEO_ID}</span>
            </div>
        </div>
    );
}
