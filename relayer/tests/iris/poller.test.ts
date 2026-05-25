import { describe, it, expect, vi } from "vitest";
import {
    waitForAttestation,
    AttestationTimeoutError,
    AbortedError,
} from "../../src/iris/poller.js";
import type { IrisClient, Attestation } from "../../src/iris/client.js";

function makeClient(responses: Attestation[][]): IrisClient {
    const calls = responses.slice();
    return {
        fetchByTx: vi.fn(async () => {
            const next = calls.shift();
            return next ?? [];
        }),
    } as unknown as IrisClient;
}

describe("waitForAttestation", () => {
    it("returns the first 'complete' attestation", async () => {
        const client = makeClient([
            [], // 404 first
            [{ status: "pending_confirmations" }],
            [{ status: "complete", attestation: "0xabc", message: "0xde" }],
        ]);
        const sleep = vi.fn(async () => {});
        const got = await waitForAttestation(client, {
            sourceDomain: 0,
            txHash: "0xtxA",
            sleep,
            now: makeFakeClock(),
        });
        expect(got.status).toBe("complete");
        expect(got.attestation).toBe("0xabc");
        // Slept twice (after the empty + after the pending response).
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    it("throws AttestationTimeoutError when deadline passes", async () => {
        const client = makeClient([[], [], [], [], [], [], []]);
        const clock = { value: 0 };
        const now = () => clock.value;
        const sleep = vi.fn(async (ms: number) => {
            clock.value += ms;
        });
        await expect(
            waitForAttestation(client, {
                sourceDomain: 0,
                txHash: "0xtxB",
                sleep,
                now,
                maxTotalWaitMs: 5_000,
            }),
        ).rejects.toBeInstanceOf(AttestationTimeoutError);
    });

    it("throws AbortedError when abort fires", async () => {
        const client = makeClient([[]]);
        const ac = new AbortController();
        const sleep = vi.fn(async () => {
            ac.abort();
        });
        await expect(
            waitForAttestation(client, {
                sourceDomain: 0,
                txHash: "0xtxC",
                abort: ac.signal,
                sleep,
                now: makeFakeClock(),
            }),
        ).rejects.toBeInstanceOf(AbortedError);
    });
});

function makeFakeClock(): () => number {
    let v = 0;
    return () => {
        v += 100;
        return v;
    };
}
