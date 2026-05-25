import type { Hex } from "viem";
import type { IrisClient, Attestation } from "./client.js";

/**
 * Poll Iris until an attestation is `complete` or the abort/deadline trips.
 *
 * Backoff schedule (ms): 2k, 4k, 8k, 15k, 30k, 60k, 60k, 60k, …
 * Total time bounded by `maxTotalWaitMs` (default 30 minutes).
 */
export interface WaitForAttestationOpts {
    sourceDomain: number;
    txHash: Hex;
    abort?: AbortSignal;
    maxTotalWaitMs?: number;
    /** Test injection: deterministic clock + sleep. */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000, 60_000];

export async function waitForAttestation(
    client: IrisClient,
    opts: WaitForAttestationOpts,
): Promise<Attestation> {
    const now = opts.now ?? (() => Date.now());
    const sleep = opts.sleep ?? defaultSleep;
    const maxWait = opts.maxTotalWaitMs ?? 30 * 60 * 1000;
    const startedAt = now();

    let attempt = 0;
    while (now() - startedAt < maxWait) {
        if (opts.abort?.aborted) throw new AbortedError();

        const messages = await client.fetchByTx(opts.sourceDomain, opts.txHash);
        const ready = messages.find((m) => m.status === "complete" && m.attestation);
        if (ready) return ready;

        const wait = DEFAULT_BACKOFF_MS[Math.min(attempt, DEFAULT_BACKOFF_MS.length - 1)] ?? 60_000;
        await sleep(wait);
        attempt += 1;
    }
    throw new AttestationTimeoutError(opts.txHash, maxWait);
}

export class AttestationTimeoutError extends Error {
    constructor(public txHash: Hex, public waitedMs: number) {
        super(`Attestation timeout for ${txHash} after ${waitedMs}ms`);
        this.name = "AttestationTimeoutError";
    }
}

export class AbortedError extends Error {
    constructor() {
        super("Aborted");
        this.name = "AbortedError";
    }
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
