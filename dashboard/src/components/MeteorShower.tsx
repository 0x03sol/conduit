"use client";

import { useEffect, useRef } from "react";

import { popArcTxHash, useArcLiveTicks } from "./useArcLive";
import { useDesktop } from "../win7/store";
import { APPS } from "../win7/apps/registry";

/**
 * MeteorShower
 *
 * One streak per real Arc-testnet transaction in the upper half of the
 * viewport. Subscribes to the live tx stream singleton; each tick queues
 * up to MAX_PER_EVENT visual spawns jittered across SPAWN_WINDOW_MS.
 *
 * Each spawning meteor takes the next available tx hash from the REST-
 * fed queue (when present); hovering the meteor shows the abbreviated
 * hash + value, and clicking opens the tx in the in-desktop Arcscan
 * window.
 */

const MAX_METEORS = 12;
const SPAWN_QUEUE_MAX = 60;
const SPAWN_WINDOW_MS = 1500;
const MAX_PER_EVENT = 4;
const METEOR_LIFE_S = 2.0;
const HIT_RADIUS_PX = 14;

interface Meteor {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    length: number;
    age: number;
    thickness: number;
    /** 0 = warm white, 1 = arc blue */
    hue: 0 | 1;
    /** Real Arc tx hash, if a hash was available when this meteor spawned. */
    txHash: string | null;
    /** Native value in wei (string), or null. */
    txValue: string | null;
}

let METEOR_ID_SEQ = 0;

/* -------------------------------------------------------------------- */
/* Helpers                                                              */
/* -------------------------------------------------------------------- */

function shortHash(h: string): string {
    return h.length >= 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

/** Format a wei string as ETH with sane precision; null-tolerant. */
function formatValue(weiStr: string | null): string | null {
    if (!weiStr) return null;
    let n = 0;
    try {
        n = Number(weiStr) / 1e18;
    } catch {
        return null;
    }
    if (!Number.isFinite(n) || n === 0) return "0 ETH";
    if (n >= 1) return `${n.toFixed(2)} ETH`;
    if (n >= 0.001) return `${n.toFixed(4)} ETH`;
    if (n >= 0.000_001) return `${n.toFixed(6)} ETH`;
    return "<1e-6 ETH";
}

/** Distance from point P to the line segment AB. */
function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
}

/* -------------------------------------------------------------------- */
/* Component                                                            */
/* -------------------------------------------------------------------- */

export function MeteorShower() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const meteorsRef = useRef<Meteor[]>([]);
    const spawnQueueRef = useRef<number[]>([]);
    const reducedMotionRef = useRef(false);
    const cursorRef = useRef<{ x: number; y: number } | null>(null);
    const hoveredIdRef = useRef<number | null>(null);

    const setArcscanTarget = useDesktop((s) => s.setArcscanTarget);
    const openApp = useDesktop((s) => s.openApp);

    /* ------------------ tx-stream subscription ------------------ */
    useArcLiveTicks((e) => {
        if (reducedMotionRef.current) return;
        const visible = Math.min(e.count, MAX_PER_EVENT);
        const now = performance.now();
        for (let i = 0; i < visible; i++) {
            if (spawnQueueRef.current.length >= SPAWN_QUEUE_MAX) break;
            spawnQueueRef.current.push(now + Math.random() * SPAWN_WINDOW_MS);
        }
    });

    /* ------------------ reduced motion ------------------ */
    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => {
            reducedMotionRef.current = mq.matches;
        };
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, []);

    /* ------------------ global pointer + click ------------------ */
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            cursorRef.current = { x: e.clientX, y: e.clientY };
        };
        const onLeave = () => {
            cursorRef.current = null;
        };
        // Capture-phase click: if we're hovering a meteor, swallow the click
        // before it can reach desktop icons / Earth and open Arcscan instead.
        const onClickCapture = (e: MouseEvent) => {
            const id = hoveredIdRef.current;
            if (id == null) return;
            const m = meteorsRef.current.find((x) => x.id === id);
            if (!m) return;
            e.stopPropagation();
            e.preventDefault();
            const url = m.txHash
                ? `https://testnet.arcscan.app/tx/${m.txHash}`
                : "https://testnet.arcscan.app/";
            setArcscanTarget(url);
            const cfg = APPS.arcscan;
            if (cfg) {
                openApp("arcscan", { title: cfg.title, bounds: cfg.defaultSize });
            }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerleave", onLeave);
        window.addEventListener("click", onClickCapture, true); // capture
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerleave", onLeave);
            window.removeEventListener("click", onClickCapture, true);
            document.body.style.cursor = "";
        };
    }, [setArcscanTarget, openApp]);

    /* ------------------ canvas render loop ------------------ */
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId = 0;
        let lastFrame = performance.now();
        let dpr = window.devicePixelRatio || 1;

        const resize = () => {
            dpr = window.devicePixelRatio || 1;
            const w = window.innerWidth;
            const h = window.innerHeight;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener("resize", resize);

        const spawn = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const x = Math.random() * (w + 200) - 200;
            const y = Math.random() * h * 0.35 - 30;
            const angle = (18 + Math.random() * 20) * (Math.PI / 180);
            const speed = 380 + Math.random() * 240;
            const length = 70 + Math.random() * 90;
            const thickness = 1 + Math.random() * 1.5;
            const hue: 0 | 1 = Math.random() < 0.2 ? 1 : 0;
            const entry = popArcTxHash();
            meteorsRef.current.push({
                id: ++METEOR_ID_SEQ,
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                length,
                age: 0,
                thickness,
                hue,
                txHash: entry?.hash ?? null,
                txValue: entry?.value ?? null,
            });
            if (meteorsRef.current.length > MAX_METEORS) meteorsRef.current.shift();
        };

        const tick = (t: number) => {
            const dt = Math.min((t - lastFrame) / 1000, 0.05);
            lastFrame = t;

            const queue = spawnQueueRef.current;
            while (queue.length && queue[0]! <= t) {
                queue.shift();
                spawn();
            }

            for (const m of meteorsRef.current) {
                m.age += dt;
                m.x += m.vx * dt;
                m.y += m.vy * dt;
            }
            const w = window.innerWidth;
            const h = window.innerHeight;
            meteorsRef.current = meteorsRef.current.filter(
                (m) => m.age < METEOR_LIFE_S && m.x < w + 200 && m.y < h * 0.65
            );

            // Hit-test cursor against each meteor's segment (hash-bearing only)
            let hovered: Meteor | null = null;
            const cur = cursorRef.current;
            if (cur) {
                let bestDist = HIT_RADIUS_PX;
                for (const m of meteorsRef.current) {
                    if (!m.txHash) continue; // only hash-bearing meteors are clickable
                    const dlen = Math.hypot(m.vx, m.vy) || 1;
                    const ex = m.x - (m.vx / dlen) * m.length;
                    const ey = m.y - (m.vy / dlen) * m.length;
                    const d = pointToSegment(cur.x, cur.y, m.x, m.y, ex, ey);
                    if (d < bestDist) {
                        bestDist = d;
                        hovered = m;
                    }
                }
            }
            const newHoverId = hovered ? hovered.id : null;
            if (newHoverId !== hoveredIdRef.current) {
                hoveredIdRef.current = newHoverId;
                document.body.style.cursor = newHoverId ? "pointer" : "";
            }

            ctx.clearRect(0, 0, w, h);

            for (const m of meteorsRef.current) {
                const life = m.age / METEOR_LIFE_S;
                let alpha: number;
                if (life < 0.15) alpha = life / 0.15;
                else if (life > 0.7) alpha = 1 - (life - 0.7) / 0.3;
                else alpha = 1;
                alpha = 1 - Math.pow(1 - alpha, 4); // ease-out-quart

                const dlen = Math.hypot(m.vx, m.vy) || 1;
                const ex = m.x - (m.vx / dlen) * m.length;
                const ey = m.y - (m.vy / dlen) * m.length;

                const headRGB = m.hue === 1 ? "140, 200, 255" : "255, 240, 220";
                const trailRGB = m.hue === 1 ? "60, 140, 255" : "230, 210, 180";

                const grad = ctx.createLinearGradient(m.x, m.y, ex, ey);
                grad.addColorStop(0, `rgba(${headRGB}, ${(0.95 * alpha).toFixed(3)})`);
                grad.addColorStop(0.5, `rgba(${trailRGB}, ${(0.4 * alpha).toFixed(3)})`);
                grad.addColorStop(1, `rgba(${trailRGB}, 0)`);

                ctx.lineWidth = m.thickness;
                ctx.lineCap = "round";
                ctx.strokeStyle = grad;
                ctx.beginPath();
                ctx.moveTo(m.x, m.y);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                const isHovered = m.id === hoveredIdRef.current;
                if (isHovered) {
                    // Halo ring for legibility
                    ctx.strokeStyle = `rgba(${headRGB}, ${(0.6 * alpha).toFixed(3)})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(m.x, m.y, m.thickness * 5.5, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.fillStyle = `rgba(${headRGB}, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(m.x, m.y, m.thickness * (isHovered ? 2.4 : 1.6), 0, Math.PI * 2);
                ctx.fill();

                if (isHovered && m.txHash) {
                    const value = formatValue(m.txValue);
                    const label = value ? `${shortHash(m.txHash)} · ${value}` : shortHash(m.txHash);
                    const labelX = m.x + 14;
                    const labelY = m.y - 10;
                    ctx.font = '11px "Consolas", "SF Mono", "Menlo", monospace';
                    const tw = ctx.measureText(label).width;
                    // Subtle dark backing so text reads on starfield
                    ctx.fillStyle = `rgba(8, 12, 24, ${(0.7 * alpha).toFixed(3)})`;
                    ctx.fillRect(labelX - 4, labelY - 12, tw + 8, 18);
                    ctx.fillStyle = `rgba(${headRGB}, ${alpha.toFixed(3)})`;
                    ctx.fillText(label, labelX, labelY);
                }
            }

            animId = requestAnimationFrame(tick);
        };
        animId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100vh",
                pointerEvents: "none",
                zIndex: 3,
                maskImage:
                    "linear-gradient(to bottom, black 0%, black 50%, transparent 60%)",
                WebkitMaskImage:
                    "linear-gradient(to bottom, black 0%, black 50%, transparent 60%)",
            }}
        />
    );
}
