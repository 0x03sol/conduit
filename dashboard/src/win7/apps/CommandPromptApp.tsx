"use client";

import { useEffect, useRef, useState } from "react";

import { runCommand, CLEAR, ANIM_ARC, ARC_FRAMES, ARC_CAPTION } from "./cmdEngine";

/**
 * CommandPromptApp
 *
 * Win7-styled terminal that simulates a bash session: types out
 * `cat README.txt` at the conduit prompt, dumps the README contents
 * line-by-line, then idles at a fresh prompt with a blinking cursor.
 *
 * Visual: pure black background, Consolas green (#33ff66) with a soft
 * phosphor glow, no menubar (matches native Win7 cmd chrome). Replaces
 * the previous README — Notepad app entirely.
 *
 * Animation re-runs on every mount, so closing and re-opening the
 * window restarts the playback.
 */

const PROMPT = "conduit@v1296847503219478650:~$";
const COMMAND = "cat README.txt";

const README = `conduit/dashboard

Cross-chain settlement on Arc Network.
A sender burns USDC once on any CCTP V2 source chain.
Recipients receive USDC or EURC on Arc, in one tx.


CHAIN
  Arc testnet        chainId 5042002
  RPC                https://rpc.arctestnet.io
  Explorer           https://testnet.arcscan.app

CONTRACTS  (Arc testnet)
  BatchRegistry          0x34705cF46Ddf9f3cE53f5492B6376678BE62F0fc
  BatchRouter            0x6eD720FDF5c28cF8895A8049Fe13AF1384d82d20
  CCTPHookReceiver       0xAe225c9F39664Ff01D11dA9cD29452a2bE0E8FE3

EXTERNAL  (Arc testnet)
  StableFX FxEscrow      0x867650F5eAe8df91445971f14d89fd84F0C9a9f8
  Permit2                0x000000000022D473030F116dDEE9F6B43aC78BA3

ONE SETTLEMENT
  1. createBatch             ->  BatchRegistry           (Arc)
  2. permit2 sign            ->  PermitTransferFrom EIP-712
  3. depositForBurnWithHook  ->  TokenMessengerV2        (source)
  4. iris poll               ->  ~24s on Sepolia         (sandbox)
  5. receiveMessage          ->  MessageTransmitterV2    (Arc)
  6. processCCTPMessage      ->  CCTPHookReceiver        (Arc)
  7. execute(batchId)        ->  BatchRouter             (Arc)
       optional fillRfq      ->  FxEscrow   USDC -> EURC
       ERC20.transfer x N    ->  recipients
       emit BatchSettled

EXAMPLE TX  (Sepolia -> Arc, 2026-05-25)
  source burn      0xa70f0cef...4f40253   Sepolia
  iris attest      24s, 3 polls           sandbox
  arc mint         0x4f1ea229...0c84ba    Arc testnet
  hook dispatch    0xfc746072...442e2     BatchSettled fired

STACK
  contracts        Solidity 0.8.26, Foundry, 148 tests
  frontend         Next.js 14, wagmi 2, viem 2, Privy
  indexer          Ponder, sqlite, drizzle
  relayer          Node.js, viem, vitest

LAYOUT
  contracts/       foundry project
  dashboard/       this app
  indexer/         ponder
  relayer/         iris poller + receiver`;

const README_LINES = README.split("\n");

const TYPE_MS = 220;       // per-char delay while typing the command (deliberate human pace)
const ENTER_PAUSE_MS = 450; // pause between Enter and first output line
const LINE_MS = 22;        // per-line delay while dumping output

type Phase = "typing" | "dumping" | "idle";

/** A solid green block cursor that blinks via the @keyframes cmd-cursor-blink rule. */
function Cursor() {
    return (
        <span
            aria-hidden
            style={{
                display: "inline-block",
                width: "0.55em",
                height: "1em",
                background: "#33ff66",
                marginLeft: "2px",
                verticalAlign: "text-bottom",
                boxShadow: "0 0 6px rgba(51, 255, 102, 0.7)",
                animation: "cmd-cursor-blink 1s step-end infinite",
            }}
        />
    );
}

export function CommandPromptApp() {
    const [phase, setPhase] = useState<Phase>("typing");
    const [typed, setTyped] = useState("");
    const [outputCount, setOutputCount] = useState(0);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    // Interactive session: history is a flat list of printed lines once
    // the README dump finishes and the prompt goes live.
    const [history, setHistory] = useState<string[]>([]);
    const [input, setInput] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Typewriter: lines still being typed out, one char at a time.
    const [pending, setPending] = useState<string[] | null>(null);
    const [pLine, setPLine] = useState(0);
    const [pChars, setPChars] = useState(0);

    // Arc cat/USDC animation: frame index while playing, or -1 when idle.
    const [animFrame, setAnimFrame] = useState(-1);

    const busy = pending !== null || animFrame >= 0;

    const submit = (raw: string) => {
        if (busy) return;
        const result = runCommand(raw, PROMPT);
        if (result[0] === CLEAR) {
            setHistory([]);
            setInput("");
            return;
        }
        const [echo, ...rest] = result;
        setHistory((h) => [...h, echo!]);
        setInput("");
        if (rest[0] === ANIM_ARC) {
            setAnimFrame(0); // kick off the cat animation
        } else if (rest.length > 0) {
            setPending(rest);
            setPLine(0);
            setPChars(0);
        }
    };

    // Typewriter loop: reveal the current pending line char-by-char, then
    // commit it to history and advance. ~14ms/char reads as live typing.
    useEffect(() => {
        if (pending === null) return;
        if (pLine >= pending.length) {
            setPending(null);
            return;
        }
        const cur = pending[pLine]!;
        if (pChars >= cur.length) {
            setHistory((h) => [...h, cur]);
            setPLine((l) => l + 1);
            setPChars(0);
            return;
        }
        const t = setTimeout(() => setPChars((c) => c + 1), 14);
        return () => clearTimeout(t);
    }, [pending, pLine, pChars]);

    // Arc animation loop: cycle ARC_FRAMES ~3 times, then print the caption.
    useEffect(() => {
        if (animFrame < 0) return;
        const TOTAL = ARC_FRAMES.length * 3; // 3 loops
        if (animFrame >= TOTAL) {
            setHistory((h) => [...h, ...ARC_CAPTION]);
            setAnimFrame(-1);
            return;
        }
        const t = setTimeout(() => setAnimFrame((f) => f + 1), 250);
        return () => clearTimeout(t);
    }, [animFrame]);

    // Phase 1: type out `cat README.txt` char-by-char
    useEffect(() => {
        if (phase !== "typing") return;
        if (typed.length >= COMMAND.length) {
            const t = setTimeout(() => setPhase("dumping"), ENTER_PAUSE_MS);
            return () => clearTimeout(t);
        }
        const t = setTimeout(
            () => setTyped(COMMAND.slice(0, typed.length + 1)),
            TYPE_MS,
        );
        return () => clearTimeout(t);
    }, [phase, typed]);

    // Phase 2: dump README line-by-line
    useEffect(() => {
        if (phase !== "dumping") return;
        if (outputCount >= README_LINES.length) {
            setPhase("idle");
            return;
        }
        const t = setTimeout(() => setOutputCount((n) => n + 1), LINE_MS);
        return () => clearTimeout(t);
    }, [phase, outputCount]);

    // Auto-scroll to bottom on every update so the latest line is in view.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [typed, outputCount, phase, history, input, pending, pChars, animFrame]);

    // Focus the input as soon as the session goes interactive (and after
    // each reply/animation finishes, so the user can keep typing).
    useEffect(() => {
        if (phase === "idle" && !busy) inputRef.current?.focus();
    }, [phase, busy]);

    return (
        <div
            ref={scrollRef}
            onClick={() => { if (phase === "idle") inputRef.current?.focus(); }}
            style={{
                height: "100%",
                background: "#000000",
                color: "#33ff66",
                fontFamily: 'Consolas, "Lucida Console", "Courier New", monospace',
                fontSize: "13px",
                lineHeight: 1.35,
                padding: "8px 10px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                textShadow: "0 0 4px rgba(51, 255, 102, 0.45)",
                boxSizing: "border-box",
            }}
        >
            {/* Initial prompt line — typed command, plus the blinking cursor while typing. */}
            <div>
                <span style={{ color: "#7af0a4" }}>{PROMPT}</span>{" "}
                <span>{typed}</span>
                {phase === "typing" && <Cursor />}
            </div>

            {/* Dumped README lines (only those revealed so far). Empty
                strings become non-collapsing line breaks via &nbsp;. */}
            {(phase === "dumping" || phase === "idle") &&
                README_LINES.slice(0, outputCount).map((line, i) => (
                    <div key={i}>{line.length === 0 ? "\u00a0" : line}</div>
                ))}

            {/* Interactive session: printed history + a live input line. */}
            {phase === "idle" && (
                <>
                    <div style={{ marginTop: "4px", color: "rgba(120,240,164,0.7)" }}>
                        {"\u00a0"}
                    </div>
                    <div style={{ color: "rgba(120,240,164,0.85)" }}>
                        type 'help' or just talk. e.g. hi, flow, contracts, settle, arc
                    </div>
                    {history.map((line, i) => (
                        <div key={i}>{line.length === 0 ? "\u00a0" : line}</div>
                    ))}

                    {/* Arc cat/USDC animation frame (swapped in place). */}
                    {animFrame >= 0 &&
                        ARC_FRAMES[animFrame % ARC_FRAMES.length]!.map((l, i) => (
                            <div key={`anim-${i}`} style={{ color: "#9af7bf" }}>{l.length === 0 ? "\u00a0" : l}</div>
                        ))}

                    {/* Typewriter: the line currently being typed out + cursor. */}
                    {pending !== null && pLine < pending.length && (
                        <div>
                            {pending[pLine]!.slice(0, pChars)}
                            <Cursor />
                        </div>
                    )}

                    {/* Live input line — only when nothing is animating/typing. */}
                    {!busy && (
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <span style={{ color: "#7af0a4" }}>{PROMPT}</span>
                            <span>{"\u00a0"}</span>
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") submit(input);
                                }}
                                spellCheck={false}
                                autoComplete="off"
                                aria-label="Conduit terminal input"
                                style={{
                                    flex: 1,
                                    background: "transparent",
                                    border: "none",
                                    outline: "none",
                                    color: "#33ff66",
                                    fontFamily: "inherit",
                                    fontSize: "inherit",
                                    textShadow: "inherit",
                                    caretColor: "#33ff66",
                                    padding: 0,
                                }}
                            />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
