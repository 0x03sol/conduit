"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Arc Solitaire — Klondike (draw-1)
 *
 * Click the stock to draw. Click a face-up card to pick it up (in the
 * tableau it grabs the run beneath it too), then click a destination
 * pile to drop. Double-click a card to send it straight to a foundation.
 * Build foundations up by suit (A->K), tableau down in alternating
 * colours. Clear all four foundations to win.
 *
 * Pure client state, no deps. Rendered with CSS card faces so suits and
 * pips stay crisp at any zoom.
 */

type Suit = 0 | 1 | 2 | 3; // 0 spade, 1 heart, 2 diamond, 3 club
type Card = { suit: Suit; rank: number; faceUp: boolean; id: string };
type PileKind = "stock" | "waste" | "foundation" | "tableau";
type Sel = { kind: PileKind; pile: number; cardIndex: number } | null;

const SUIT_CHAR = ["\u2660", "\u2665", "\u2666", "\u2663"];
const RANK_CHAR = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const isRed = (s: Suit) => s === 1 || s === 2;

function freshDeck(): Card[] {
    const d: Card[] = [];
    for (let s = 0 as Suit; s < 4; s = (s + 1) as Suit) {
        for (let r = 1; r <= 13; r++) d.push({ suit: s, rank: r, faceUp: false, id: `${s}-${r}` });
    }
    // Fisher-Yates
    for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [d[i], d[j]] = [d[j]!, d[i]!];
    }
    return d;
}

interface Game {
    stock: Card[];
    waste: Card[];
    foundations: Card[][];
    tableau: Card[][];
}

function deal(): Game {
    const deck = freshDeck();
    const tableau: Card[][] = [[], [], [], [], [], [], []];
    let k = 0;
    for (let col = 0; col < 7; col++) {
        for (let n = 0; n <= col; n++) {
            const c = deck[k++]!;
            c.faceUp = n === col;
            tableau[col]!.push(c);
        }
    }
    return { stock: deck.slice(k), waste: [], foundations: [[], [], [], []], tableau };
}

const canToFoundation = (c: Card, f: Card[]): boolean =>
    f.length === 0 ? c.rank === 1 : f[f.length - 1]!.suit === c.suit && f[f.length - 1]!.rank === c.rank - 1;

const canToTableau = (c: Card, t: Card[]): boolean =>
    t.length === 0 ? c.rank === 13 : isRed(t[t.length - 1]!.suit) !== isRed(c.suit) && t[t.length - 1]!.rank === c.rank + 1;

export function ArcSolitaireApp() {
    const [game, setGame] = useState<Game>(() => deal());
    const [moves, setMoves] = useState(0);

    const won = useMemo(() => game.foundations.every((f) => f.length === 13), [game]);

    const reset = useCallback(() => {
        setGame(deal());
        setMoves(0);
    }, []);

    // Draw from stock (recycle waste when empty). Pure: one setGame call.
    const drawStock = () => {
        setGame((g) => {
            if (g.stock.length === 0) {
                return { ...g, stock: g.waste.slice().reverse().map((c) => ({ ...c, faceUp: false })), waste: [] };
            }
            const stock = g.stock.slice();
            const c = stock.pop()!;
            return { ...g, stock, waste: [...g.waste, { ...c, faceUp: true }] };
        });
    };

    // Single-click auto-move: figure out the destination automatically.
    // Tries the foundations first (single card), then each tableau column.
    // Computed from the current `game` snapshot; one setGame call.
    const autoMove = (kind: PileKind, pile: number, cardIndex: number) => {
        const next = structuredClone(game) as Game;

        let moving: Card[];
        if (kind === "waste") {
            if (next.waste.length === 0) return;
            moving = next.waste.slice(-1);
        } else if (kind === "tableau") {
            const col = next.tableau[pile]!;
            if (cardIndex < 0 || cardIndex >= col.length) return;
            moving = col.slice(cardIndex);
            // The grabbed run must be face-up and a valid descending
            // alternating-colour sequence to move as a group.
            for (let i = 0; i < moving.length; i++) {
                if (!moving[i]!.faceUp) return;
                if (i > 0) {
                    const a = moving[i - 1]!, c = moving[i]!;
                    if (!(isRed(a.suit) !== isRed(c.suit) && a.rank === c.rank + 1)) return;
                }
            }
        } else {
            return; // foundation cards stay put
        }

        const top = moving[0]!;
        const sel: NonNullable<Sel> = { kind, pile, cardIndex };

        // 1) foundation (single card only)
        if (moving.length === 1) {
            const fi = next.foundations.findIndex((f) => canToFoundation(top, f));
            if (fi >= 0) {
                removeGrabbed(next, sel, 1);
                next.foundations[fi]!.push(top);
                flipExposed(next, sel);
                setGame(next);
                setMoves((m) => m + 1);
                return;
            }
        }
        // 2) first valid tableau column (not the source)
        for (let ti = 0; ti < 7; ti++) {
            if (kind === "tableau" && ti === pile) continue;
            if (canToTableau(top, next.tableau[ti]!)) {
                removeGrabbed(next, sel, moving.length);
                next.tableau[ti]!.push(...moving);
                flipExposed(next, sel);
                setGame(next);
                setMoves((m) => m + 1);
                return;
            }
        }
        // no legal move — do nothing
    };

    // Click (or double-click) any face-up card → auto-move it.
    const onCard = (kind: PileKind, pile: number, cardIndex: number, card: Card) => {
        if (!card.faceUp) return;
        autoMove(kind, pile, cardIndex);
    };

    return (
        <div
            style={{
                height: "100%",
                background: "linear-gradient(160deg, #0b5d2e 0%, #0a4f28 55%, #08401f 100%)",
                padding: "12px",
                boxSizing: "border-box",
                fontFamily: '"Segoe UI", Tahoma, sans-serif',
                overflow: "auto",
                userSelect: "none",
            }}
        >
            {/* Toolbar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", color: "#eafff0" }}>
                <span style={{ fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>Moves: {moves}</span>
                <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "0.5px" }}>Arc Solitaire</span>
                <button type="button" onClick={reset} style={{ fontFamily: "inherit", fontSize: "11px", padding: "3px 12px" }}>New game</button>
            </div>
            <div style={{ fontSize: "10.5px", color: "rgba(234,255,240,0.6)", marginBottom: "10px" }}>
                click the deck to draw. click any card to auto-play it.
            </div>

            {/* Top row: stock + waste ... foundations */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <Slot onClick={drawStock}>
                    {game.stock.length > 0
                        ? <CardBack onClick={drawStock} />
                        : <Recycle />}
                </Slot>
                <Slot>
                    {game.waste.length > 0
                        ? <CardFace
                            card={game.waste[game.waste.length - 1]!}
                            onClick={() => onCard("waste", 0, game.waste.length - 1, game.waste[game.waste.length - 1]!)}
                          />
                        : null}
                </Slot>

                <div style={{ flex: 1 }} />

                {game.foundations.map((f, i) => (
                    <Slot key={i} hint={SUIT_CHAR[i]}>
                        {f.length > 0
                            ? <CardFace card={f[f.length - 1]!} />
                            : null}
                    </Slot>
                ))}
            </div>

            {/* Tableau */}
            <div style={{ display: "flex", gap: "8px" }}>
                {game.tableau.map((col, ci) => (
                    <div key={ci} style={{ flex: 1, minWidth: "56px" }}>
                        {col.length === 0 ? (
                            <Slot />
                        ) : (
                            <div style={{ position: "relative", height: `${(col.length - 1) * 22 + 80}px` }}>
                                {col.map((card, idx) => (
                                    <div key={card.id} style={{ position: "absolute", top: `${idx * 22}px`, left: 0, right: 0 }}>
                                        {card.faceUp
                                            ? <CardFace
                                                card={card}
                                                onClick={() => onCard("tableau", ci, idx, card)}
                                              />
                                            : <CardBack />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {won && (
                <div style={{ marginTop: "16px", textAlign: "center", color: "#eafff0" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700 }}>You win.</div>
                    <button type="button" onClick={reset} style={{ marginTop: "8px", fontFamily: "inherit", fontSize: "12px", padding: "4px 16px" }}>Play again</button>
                </div>
            )}
        </div>
    );
}

/* ── Move helpers (operate on a cloned game) ── */
function removeGrabbed(g: Game, sel: NonNullable<Sel>, n: number) {
    if (sel.kind === "waste") g.waste.splice(g.waste.length - n, n);
    else if (sel.kind === "foundation") g.foundations[sel.pile]!.splice(g.foundations[sel.pile]!.length - n, n);
    else if (sel.kind === "tableau") g.tableau[sel.pile]!.splice(sel.cardIndex, n);
}
function flipExposed(g: Game, sel: NonNullable<Sel>) {
    if (sel.kind === "tableau") {
        const col = g.tableau[sel.pile]!;
        const top = col[col.length - 1];
        if (top && !top.faceUp) top.faceUp = true;
    }
}

/* ── Presentational card pieces ── */
const CARD_W = 58;
const CARD_H = 80;

function Slot({ children, onClick, hint }: { children?: React.ReactNode; onClick?: () => void; hint?: string }) {
    return (
        <div
            onClick={onClick}
            style={{
                width: CARD_W, height: CARD_H, flex: "0 0 auto",
                borderRadius: 6,
                border: "1.5px solid rgba(255,255,255,0.28)",
                background: "rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "rgba(255,255,255,0.30)", fontSize: 26,
            }}
        >
            {children ?? hint ?? null}
        </div>
    );
}

function CardFace({ card, selected, onClick, onDouble }: { card: Card; selected?: boolean; onClick?: () => void; onDouble?: () => void }) {
    const red = isRed(card.suit);
    return (
        <div
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            onDoubleClick={(e) => { e.stopPropagation(); onDouble?.(); }}
            style={{
                width: CARD_W, height: CARD_H,
                borderRadius: 6,
                background: "linear-gradient(180deg, #ffffff 0%, #f3f6fb 100%)",
                border: selected ? "2px solid #ffd34d" : "1px solid #2c3e50",
                boxShadow: selected ? "0 0 8px rgba(255,211,77,0.8)" : "0 1px 3px rgba(0,0,0,0.35)",
                color: red ? "#cc2222" : "#16202b",
                position: "relative", cursor: "pointer",
                fontWeight: 700,
            }}
        >
            <div style={{ position: "absolute", top: 3, left: 5, fontSize: 13, lineHeight: 1 }}>
                {RANK_CHAR[card.rank]}<div style={{ fontSize: 12 }}>{SUIT_CHAR[card.suit]}</div>
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
                {SUIT_CHAR[card.suit]}
            </div>
        </div>
    );
}

function CardBack({ onClick }: { onClick?: () => void }) {
    return (
        <div
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            style={{
                width: CARD_W, height: CARD_H, borderRadius: 6,
                background:
                    "repeating-linear-gradient(45deg, #1f5fb6 0 6px, #1a539e 6px 12px)",
                border: "1px solid #0d2d57",
                boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                cursor: onClick ? "pointer" : "default",
            }}
        />
    );
}

function Recycle() {
    return <span style={{ fontSize: 22, color: "rgba(255,255,255,0.45)" }}>{"\u21BB"}</span>;
}
