import { describe, it, expect, vi } from "vitest";
import { IrisClient, IrisHttpError } from "../../src/iris/client.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("IrisClient.fetchByTx", () => {
    it("returns [] on 404", async () => {
        const fetch = vi.fn(async () => new Response("not found", { status: 404 }));
        const client = new IrisClient({ baseUrl: "https://iris-api-sandbox.example", fetch });
        const out = await client.fetchByTx(0, "0xabc");
        expect(out).toEqual([]);
        expect(fetch).toHaveBeenCalledWith(
            "https://iris-api-sandbox.example/v2/messages/0?transactionHash=0xabc",
            expect.objectContaining({ method: "GET" }),
        );
    });

    it("parses pending_confirmations response", async () => {
        const fetch = vi.fn(async () =>
            jsonResponse({
                messages: [{ status: "pending_confirmations" }],
            }),
        );
        const client = new IrisClient({ baseUrl: "https://iris-api-sandbox.example", fetch });
        const out = await client.fetchByTx(0, "0xabc");
        expect(out).toHaveLength(1);
        expect(out[0]?.status).toBe("pending_confirmations");
        expect(out[0]?.attestation).toBeUndefined();
    });

    it("parses complete response with attestation", async () => {
        const fetch = vi.fn(async () =>
            jsonResponse({
                messages: [
                    {
                        status: "complete",
                        attestation: "0xdeadbeef",
                        message: "0xcafe",
                        eventNonce: "1",
                        cctpVersion: 2,
                    },
                ],
            }),
        );
        const client = new IrisClient({ baseUrl: "https://iris-api-sandbox.example", fetch });
        const out = await client.fetchByTx(0, "0xabc");
        expect(out[0]?.status).toBe("complete");
        expect(out[0]?.attestation).toBe("0xdeadbeef");
    });

    it("throws IrisHttpError on 5xx", async () => {
        const fetch = vi.fn(async () => new Response("upstream broken", { status: 503 }));
        const client = new IrisClient({ baseUrl: "https://iris-api-sandbox.example", fetch });
        await expect(client.fetchByTx(0, "0xabc")).rejects.toBeInstanceOf(IrisHttpError);
    });

    it("throws on schema mismatch", async () => {
        const fetch = vi.fn(async () =>
            jsonResponse({
                messages: [{ status: "weird-status" }],
            }),
        );
        const client = new IrisClient({ baseUrl: "https://iris-api-sandbox.example", fetch });
        await expect(client.fetchByTx(0, "0xabc")).rejects.toThrow(/schema/);
    });

    it("strips trailing slash from baseUrl", async () => {
        const fetch = vi.fn(async () => jsonResponse({ messages: [] }));
        const client = new IrisClient({ baseUrl: "https://x.example/", fetch });
        await client.fetchByTx(7, "0xabc");
        expect(fetch).toHaveBeenCalledWith(
            "https://x.example/v2/messages/7?transactionHash=0xabc",
            expect.anything(),
        );
    });
});
