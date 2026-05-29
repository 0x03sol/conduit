"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Arc Snake
 *
 * Arrow keys or WASD steer. Eat the orb to grow and score. Hitting a
 * wall or yourself ends the round; Space restarts. Rounded gradient
 * body, glowing food, subtle grid + vignette for a polished board.
 */

const COLS = 24;
const ROWS = 18;
const CELL = 18;
const TICK_MS = 100;

type Pt = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const DELTA: Record<Dir, Pt> = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

function randFood(snake: Pt[]): Pt {
    while (true) {
        const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
        if (!snake.some((s) => s.x === f.x && s.y === f.y)) return f;
    }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

export function ArcSnakeApp() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [score, setScore] = useState(0);
    const [best, setBest] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [running, setRunning] = useState(true);

    const snakeRef = useRef<Pt[]>([{ x: 6, y: 9 }, { x: 5, y: 9 }, { x: 4, y: 9 }]);
    const dirRef = useRef<Dir>("right");
    const nextDirRef = useRef<Dir>("right");
    const foodRef = useRef<Pt>(randFood(snakeRef.current));

    const reset = useCallback(() => {
        snakeRef.current = [{ x: 6, y: 9 }, { x: 5, y: 9 }, { x: 4, y: 9 }];
        dirRef.current = "right";
        nextDirRef.current = "right";
        foodRef.current = randFood(snakeRef.current);
        setScore(0);
        setGameOver(false);
        setRunning(true);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const map: Record<string, Dir> = {
                ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
                w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
            };
            const d = map[e.key];
            if (d) {
                e.preventDefault();
                if (d !== OPPOSITE[dirRef.current]) nextDirRef.current = d;
                return;
            }
            if ((e.key === " " || e.key === "Enter") && gameOver) { e.preventDefault(); reset(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [gameOver, reset]);

    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => {
            const dir = nextDirRef.current;
            dirRef.current = dir;
            const head = snakeRef.current[0]!;
            const next: Pt = { x: head.x + DELTA[dir].x, y: head.y + DELTA[dir].y };
            const hitWall = next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS;
            const hitSelf = snakeRef.current.some((s) => s.x === next.x && s.y === next.y);
            if (hitWall || hitSelf) {
                setBest((b) => Math.max(b, score));
                setGameOver(true);
                setRunning(false);
                return;
            }
            const ate = next.x === foodRef.current.x && next.y === foodRef.current.y;
            const newSnake = [next, ...snakeRef.current];
            if (ate) { setScore((s) => s + 1); foodRef.current = randFood(newSnake); }
            else newSnake.pop();
            snakeRef.current = newSnake;
        }, TICK_MS);
        return () => clearInterval(id);
    }, [running, score]);

    useEffect(() => {
        let raf = 0;
        const W = COLS * CELL, H = ROWS * CELL;
        const draw = () => {
            const ctx = canvasRef.current?.getContext("2d");
            if (ctx) {
                // Board gradient
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, "#0c2444");
                g.addColorStop(1, "#071933");
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, W, H);
                // Grid
                ctx.strokeStyle = "rgba(255,255,255,0.035)";
                ctx.lineWidth = 1;
                for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke(); }
                for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke(); }
                // Food — glowing orb
                const f = foodRef.current;
                const fx = f.x * CELL + CELL / 2, fy = f.y * CELL + CELL / 2;
                ctx.save();
                ctx.shadowColor = "rgba(255,92,92,0.9)";
                ctx.shadowBlur = 12;
                const fg = ctx.createRadialGradient(fx - 2, fy - 2, 1, fx, fy, CELL / 2);
                fg.addColorStop(0, "#ff9a9a");
                fg.addColorStop(1, "#e23b3b");
                ctx.fillStyle = fg;
                ctx.beginPath();
                ctx.arc(fx, fy, CELL / 2 - 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // Snake — rounded gradient segments, brighter head, glow
                const snake = snakeRef.current;
                for (let i = snake.length - 1; i >= 0; i--) {
                    const s = snake[i]!;
                    const t = 1 - i / Math.max(snake.length, 1);
                    const px = s.x * CELL, py = s.y * CELL;
                    ctx.save();
                    if (i === 0) { ctx.shadowColor = "rgba(95,163,255,0.8)"; ctx.shadowBlur = 10; }
                    const sg = ctx.createLinearGradient(px, py, px, py + CELL);
                    if (i === 0) { sg.addColorStop(0, "#8fc2ff"); sg.addColorStop(1, "#4d8fe6"); }
                    else { sg.addColorStop(0, `rgba(90,150,235,${0.65 + t * 0.35})`); sg.addColorStop(1, `rgba(60,120,210,${0.6 + t * 0.35})`); }
                    ctx.fillStyle = sg;
                    roundRect(ctx, px + 1.5, py + 1.5, CELL - 3, CELL - 3, 5);
                    ctx.fill();
                    ctx.restore();
                }
            }
            raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);

    const W = COLS * CELL;
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: "#06162b", color: "#dce8fb", fontFamily: '"Segoe UI", Tahoma, sans-serif', padding: "10px", boxSizing: "border-box" }}>
            <div style={{ width: W, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", marginBottom: "8px" }}>
                <span style={{ fontWeight: 600 }}>Arc Snake</span>
                <span style={{ display: "flex", gap: "14px", fontVariantNumeric: "tabular-nums" }}>
                    <span>score <b style={{ color: "#8fc2ff" }}>{score}</b></span>
                    <span style={{ color: "rgba(220,232,251,0.6)" }}>best {Math.max(best, score)}</span>
                </span>
            </div>
            <div style={{ position: "relative", width: W, height: ROWS * CELL }}>
                <canvas ref={canvasRef} width={W} height={ROWS * CELL} style={{ display: "block", borderRadius: "6px", border: "1px solid #1f4a7a", boxShadow: "inset 0 0 40px rgba(0,0,0,0.45)" }} />
                {gameOver && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(6,22,43,0.82)", borderRadius: "6px", gap: "10px" }}>
                        <div style={{ fontSize: "20px", fontWeight: 700 }}>Game over</div>
                        <div style={{ fontSize: "13px", color: "rgba(220,232,251,0.85)" }}>score {score}</div>
                        <button type="button" onClick={reset} style={{ fontFamily: "inherit", fontSize: "12px", padding: "5px 16px" }}>Play again</button>
                        <div style={{ fontSize: "11px", color: "rgba(220,232,251,0.5)" }}>or press Space</div>
                    </div>
                )}
            </div>
            <div style={{ marginTop: "8px", fontSize: "11px", color: "rgba(220,232,251,0.45)" }}>arrow keys or WASD</div>
        </div>
    );
}
