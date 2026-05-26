"use client";

/**
 * Arc TV — Media Player
 *
 * Win7-styled "media player" window. Embeds Wistia videos via plain
 * iframes; the Morpho × Arc page on community.arc.io ships
 * `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` so we cannot
 * iframe that page directly — instead we embed the underlying Wistia
 * video that page uses (hashedId `afz5db76x0`), which is publicly
 * embeddable.
 */
const WISTIA_BASE = "https://fast.wistia.net/embed/iframe";
const VIDEO_ID = "afz5db76x0";

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
                {/* ------- Video 1 ------- */}
                <div style={{ marginBottom: "16px" }}>
                    <VideoFrame
                        src={`${WISTIA_BASE}/${VIDEO_ID}`}
                        title="Arc TV — Featured"
                    />
                </div>

                {/* ------- Video 2: Morpho × Arc ------- */}
                <div style={{ borderTop: "1px solid #c4d6ea", paddingTop: "12px" }}>
                    <h2
                        style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            margin: "0 0 6px",
                            color: "#1e395b",
                            fontFamily: "inherit",
                        }}
                    >
                        Morpho × Arc — Merlin Egalite
                    </h2>

                    <VideoFrame
                        src={`${WISTIA_BASE}/${VIDEO_ID}?videoFoam=true`}
                        title="Morpho × Arc — Merlin Egalite"
                    />

                    {/* Speaker line */}
                    <div
                        style={{
                            marginTop: "8px",
                            fontSize: "11px",
                            color: "#000",
                            fontWeight: 600,
                        }}
                    >
                        Speaker: Merlin Egalite,{" "}
                        <span style={{ fontWeight: 400 }}>Co-Founder of Morpho</span>
                    </div>

                    {/* Grey description */}
                    <p
                        style={{
                            marginTop: "6px",
                            marginBottom: 0,
                            fontSize: "11px",
                            lineHeight: 1.4,
                            color: "#777",
                            fontFamily: "inherit",
                        }}
                    >
                        Morpho is building the universal lending protocol where anyone can
                        build, earn, or borrow on top of it. Soon live on Arc.
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
                <span>Now playing: Arc TV</span>
                <span>Wistia · {VIDEO_ID}</span>
            </div>
        </div>
    );
}
