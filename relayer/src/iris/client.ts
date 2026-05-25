import { z } from "zod";
import type { Hex } from "viem";

const Hex0x = z.string().regex(/^0x[0-9a-fA-F]*$/);

/**
 * Per-message attestation record from the Iris API.
 * Source: developers.circle.com/cctp/references/technical-guide
 */
export const AttestationSchema = z.object({
    /** "complete" → attestation field is populated and submittable. */
    status: z.enum(["pending_confirmations", "complete"]),
    attestation: Hex0x.optional(),
    /** Raw message bytes Iris signed (matches what we observed on-chain). */
    message: Hex0x.optional(),
    eventNonce: z.string().optional(),
    cctpVersion: z.number().optional(),
});
export type Attestation = z.infer<typeof AttestationSchema>;

const ResponseSchema = z.object({
    messages: z.array(AttestationSchema),
});

export interface IrisClientOptions {
    /** Base URL — e.g. https://iris-api-sandbox.circle.com */
    baseUrl: string;
    /** Optional fetch impl (test injection). Defaults to globalThis.fetch. */
    fetch?: typeof globalThis.fetch;
    /** Per-request timeout in ms. Defaults to 10s. */
    timeoutMs?: number;
}

export class IrisClient {
    private readonly baseUrl: string;
    private readonly _fetch: typeof globalThis.fetch;
    private readonly timeoutMs: number;

    constructor(opts: IrisClientOptions) {
        this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
        this._fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
        this.timeoutMs = opts.timeoutMs ?? 10_000;
    }

    /**
     * Fetch attestations for every message produced by a single source-chain
     * transaction. Returns an empty array if the tx is not yet visible to
     * Iris (HTTP 404), or for any other not-yet-relayable response.
     *
     * NEVER throws on 404; throws on 5xx, network errors, or schema mismatch.
     */
    async fetchByTx(sourceDomain: number, txHash: Hex): Promise<Attestation[]> {
        const url = `${this.baseUrl}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), this.timeoutMs);

        let res: Response;
        try {
            res = await this._fetch(url, { method: "GET", signal: ac.signal });
        } finally {
            clearTimeout(timer);
        }

        if (res.status === 404) return [];
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new IrisHttpError(res.status, body, url);
        }

        const json = await res.json();
        const parsed = ResponseSchema.safeParse(json);
        if (!parsed.success) {
            throw new Error(`Iris response failed schema: ${parsed.error.message}`);
        }
        return parsed.data.messages;
    }
}

export class IrisHttpError extends Error {
    constructor(public status: number, public body: string, public url: string) {
        super(`Iris ${status} on ${url}: ${body.slice(0, 200)}`);
        this.name = "IrisHttpError";
    }
}
