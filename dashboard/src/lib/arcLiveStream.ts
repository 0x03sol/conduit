/**
 * Single-connection Arc-testnet live stream.
 *
 * One WebSocket to Arcscan's Phoenix channel for the high-frequency tick;
 * one REST poll loop to keep a queue of recent tx hashes (and values) so
 * that meteor clicks can deep-link to a real transaction.
 *
 * Module-level singleton: any subscriber via `subscribe()` triggers the
 * connection if not yet open; the last unsubscribe tears it down. Callers
 * never instantiate; they just import and use.
 */

const WS_URL = "wss://testnet.arcscan.app/socket/v2/websocket?vsn=2.0.0";
const REST_URL = "https://testnet.arcscan.app/api/v2/main-page/transactions";

const HEARTBEAT_MS = 30_000;
const REST_POLL_MS = 4_000;
const RECONNECT_MAX_MS = 30_000;
const FALLBACK_AFTER = 3; // failed reconnects before we declare polling-only mode
const RATE_WINDOW_MS = 30_000; // rolling window for tx/s rate
const HASH_QUEUE_MAX = 120;
const HASH_SEEN_MAX = 600;

export type Status = "connecting" | "live" | "polling" | "offline";

export interface TxHashEntry {
    hash: string;
    /** Native value in wei, as string. May be "0" or undefined. */
    value: string | null;
}

export interface TickEvent {
    /** Number of new transactions reported by this broadcast. */
    count: number;
    /** Unix-epoch ms when the event was received locally. */
    ts: number;
}

type Listener = (e: TickEvent) => void;
type StatusListener = (s: Status) => void;

let started = false;
let ws: WebSocket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let attempts = 0;
let status: Status = "offline";

const listeners = new Set<Listener>();
const statusListeners = new Set<StatusListener>();

/** Recent event timestamps (with their count) for rate calculation. */
const tickHistory: Array<{ ts: number; count: number }> = [];

/** FIFO queue of fresh tx hashes pulled from REST. Consumed by meteors. */
const hashQueue: TxHashEntry[] = [];

/** Hashes we have already fed to the queue (avoid duplicates across polls). */
const hashSeen = new Set<string>();
let pollPrimed = false;

/* -------------------------------------------------------------------- */
/* Internal helpers                                                     */
/* -------------------------------------------------------------------- */

function setStatus(s: Status) {
    if (s === status) return;
    status = s;
    statusListeners.forEach((fn) => {
        try { fn(s); } catch { /* swallow */ }
    });
}

function recordTick(count: number) {
    const now = Date.now();
    tickHistory.push({ ts: now, count });
    // Drop history older than the rate window
    const cutoff = now - RATE_WINDOW_MS;
    while (tickHistory.length && tickHistory[0]!.ts < cutoff) tickHistory.shift();
    listeners.forEach((fn) => {
        try { fn({ count, ts: now }); } catch { /* swallow */ }
    });
}

async function pollRestTx() {
    try {
        const res = await fetch(REST_URL, { credentials: "omit", cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const items: any[] = Array.isArray(data) ? data : data?.items ?? [];
        let freshDuringPriming = 0;
        // Items come newest-first from Blockscout. Iterate oldest-first so
        // the queue is also oldest-first (FIFO matches arrival order).
        for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            const h: unknown = it?.hash;
            if (typeof h !== "string") continue;
            if (hashSeen.has(h)) continue;
            hashSeen.add(h);
            const value = typeof it?.value === "string" ? it.value : null;
            // During priming we DON'T queue — we just register what's already
            // historical so we don't spam meteors with old hashes on first load.
            if (pollPrimed) {
                hashQueue.push({ hash: h, value });
                if (hashQueue.length > HASH_QUEUE_MAX) hashQueue.shift();
            } else {
                freshDuringPriming++;
            }
        }
        // Trim seen-set memory
        if (hashSeen.size > HASH_SEEN_MAX) {
            const arr = Array.from(hashSeen);
            hashSeen.clear();
            for (const h of arr.slice(-Math.floor(HASH_SEEN_MAX * 0.6))) hashSeen.add(h);
        }
        if (!pollPrimed) {
            pollPrimed = true;
            // Suppress the "first poll" meteor burst in case we lost the WS:
            // first batch of hashes is treated as historical context only.
            void freshDuringPriming; // intentionally unused
        }
    } catch {
        /* network error; try again next interval */
    }
}

function startRestPoll() {
    if (pollTimer) return;
    void pollRestTx();
    pollTimer = setInterval(() => void pollRestTx(), REST_POLL_MS);
}

function stopRestPoll() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function connect() {
    if (typeof WebSocket === "undefined") {
        setStatus("polling");
        startRestPoll();
        return;
    }
    setStatus("connecting");
    try {
        ws = new WebSocket(WS_URL);
    } catch {
        setStatus("polling");
        startRestPoll();
        scheduleReconnect();
        return;
    }
    ws.onopen = () => {
        attempts = 0;
        setStatus("live");
        ws?.send(JSON.stringify(["1", "1", "transactions:new_transaction", "phx_join", {}]));
        heartbeat = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify([null, `hb-${Date.now()}`, "phoenix", "heartbeat", {}]));
            }
        }, HEARTBEAT_MS);
    };
    ws.onmessage = (ev) => {
        try {
            const arr = JSON.parse(ev.data);
            if (
                Array.isArray(arr) &&
                arr[2] === "transactions:new_transaction" &&
                arr[3] === "transaction"
            ) {
                const c = arr[4]?.transaction;
                const count = typeof c === "number" && c > 0 ? c : 1;
                recordTick(count);
            }
        } catch { /* malformed frame */ }
    };
    ws.onerror = () => { /* close will follow */ };
    ws.onclose = () => {
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        attempts += 1;
        if (attempts >= FALLBACK_AFTER) {
            setStatus("polling");
        } else {
            setStatus("connecting");
        }
        scheduleReconnect();
    };
}

function scheduleReconnect() {
    if (!started) return;
    if (reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** Math.max(attempts, 1), RECONNECT_MAX_MS);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, delay);
}

function startConnection() {
    if (started) return;
    started = true;
    connect();
    startRestPoll();
}

function stopConnection() {
    started = false;
    try { ws?.close(); } catch { /* noop */ }
    ws = null;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    stopRestPoll();
    pollPrimed = false;
    hashSeen.clear();
    hashQueue.length = 0;
    tickHistory.length = 0;
    attempts = 0;
    setStatus("offline");
}

/* -------------------------------------------------------------------- */
/* Public API                                                           */
/* -------------------------------------------------------------------- */

export function subscribe(fn: Listener): () => void {
    listeners.add(fn);
    if (!started) startConnection();
    return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && statusListeners.size === 0) stopConnection();
    };
}

export function subscribeStatus(fn: StatusListener): () => void {
    statusListeners.add(fn);
    fn(status); // emit current immediately
    if (!started) startConnection();
    return () => {
        statusListeners.delete(fn);
        if (listeners.size === 0 && statusListeners.size === 0) stopConnection();
    };
}

/** Pop a fresh tx-hash entry from the queue, or null if none ready. */
export function nextTxHash(): TxHashEntry | null {
    return hashQueue.shift() ?? null;
}

/** Current rolling tx/s rate, computed over RATE_WINDOW_MS. */
export function getRate(): number {
    if (tickHistory.length === 0) return 0;
    const now = Date.now();
    const cutoff = now - RATE_WINDOW_MS;
    let sum = 0;
    let earliest = now;
    for (const t of tickHistory) {
        if (t.ts < cutoff) continue;
        sum += t.count;
        if (t.ts < earliest) earliest = t.ts;
    }
    const elapsedMs = Math.max(1000, now - earliest);
    return (sum / elapsedMs) * 1000;
}

export function getStatus(): Status {
    return status;
}
