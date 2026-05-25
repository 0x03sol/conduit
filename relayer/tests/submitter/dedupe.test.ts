import { describe, it, expect, vi } from "vitest";
import { submitReceiveMessage } from "../../src/submitter/receiveMessage.js";
import { openDb, relayMessages } from "../../src/db/client.js";
import { eq } from "drizzle-orm";

const NOOP_LOG = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
} as unknown as Parameters<typeof submitReceiveMessage>[0]["logger"];

describe("submitReceiveMessage", () => {
    it("short-circuits when the row is already 'submitting'", async () => {
        const { db, sqlite } = openDb("file::memory:");
        try {
            db.insert(relayMessages)
                .values({
                    messageHash: "0xhashA",
                    sourceDomain: 0,
                    destDomain: 1,
                    sourceTxHash: "0xtxA",
                    sourceBlock: 1,
                    rawMessage: "0xdead",
                    attestation: "0xabcd",
                    status: "submitting",
                    destTxHash: "0xPRIORtx",
                    attempts: 1,
                    seenAt: new Date(),
                })
                .run();

            const sendTransaction = vi.fn();
            const waitForTransactionReceipt = vi.fn();

            const result = await submitReceiveMessage(
                {
                    walletClient: { sendTransaction } as any,
                    publicClient: { waitForTransactionReceipt } as any,
                    db,
                    logger: NOOP_LOG,
                    dstMessageTransmitter: "0x1111111111111111111111111111111111111111",
                },
                {
                    messageHash: "0xhashA",
                    message: "0xdead",
                    attestation: "0xabcd",
                },
            );

            expect(result.alreadySubmitted).toBe(true);
            expect(result.txHash).toBe("0xPRIORtx");
            expect(sendTransaction).not.toHaveBeenCalled();
            expect(waitForTransactionReceipt).not.toHaveBeenCalled();
        } finally {
            sqlite.close();
        }
    });

    it("submits and confirms on a fresh attested row", async () => {
        const { db, sqlite } = openDb("file::memory:");
        try {
            const seenAt = new Date();
            db.insert(relayMessages)
                .values({
                    messageHash: "0xhashB",
                    sourceDomain: 0,
                    destDomain: 1,
                    sourceTxHash: "0xtxB",
                    sourceBlock: 2,
                    rawMessage: "0xfeed",
                    attestation: "0xcafe",
                    status: "attested",
                    attempts: 0,
                    seenAt,
                    attestedAt: seenAt,
                })
                .run();

            const sendTransaction = vi.fn(async () => "0xnewtx" as `0x${string}`);
            const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" as const }));

            const result = await submitReceiveMessage(
                {
                    walletClient: { sendTransaction, account: { address: "0xa" }, chain: { id: 1 } } as any,
                    publicClient: { waitForTransactionReceipt } as any,
                    db,
                    logger: NOOP_LOG,
                    dstMessageTransmitter: "0x1111111111111111111111111111111111111111",
                },
                {
                    messageHash: "0xhashB",
                    message: "0xfeed",
                    attestation: "0xcafe",
                },
            );

            expect(result.alreadySubmitted).toBe(false);
            expect(result.txHash).toBe("0xnewtx");
            expect(sendTransaction).toHaveBeenCalledTimes(1);

            const row = db.select().from(relayMessages).where(eq(relayMessages.messageHash, "0xhashB")).get();
            expect(row?.status).toBe("confirmed");
            expect(row?.destTxHash).toBe("0xnewtx");
            expect(row?.attempts).toBe(1);
        } finally {
            sqlite.close();
        }
    });

    it("marks 'failed' when the destination tx reverts", async () => {
        const { db, sqlite } = openDb("file::memory:");
        try {
            db.insert(relayMessages)
                .values({
                    messageHash: "0xhashC",
                    sourceDomain: 0,
                    destDomain: 1,
                    sourceTxHash: "0xtxC",
                    sourceBlock: 3,
                    rawMessage: "0xff",
                    attestation: "0x01",
                    status: "attested",
                    attempts: 0,
                    seenAt: new Date(),
                })
                .run();

            const sendTransaction = vi.fn(async () => "0xreverter" as `0x${string}`);
            const waitForTransactionReceipt = vi.fn(async () => ({ status: "reverted" as const }));

            await submitReceiveMessage(
                {
                    walletClient: { sendTransaction } as any,
                    publicClient: { waitForTransactionReceipt } as any,
                    db,
                    logger: NOOP_LOG,
                    dstMessageTransmitter: "0x1111111111111111111111111111111111111111",
                },
                {
                    messageHash: "0xhashC",
                    message: "0xff",
                    attestation: "0x01",
                },
            );

            const row = db.select().from(relayMessages).where(eq(relayMessages.messageHash, "0xhashC")).get();
            expect(row?.status).toBe("failed");
            expect(row?.error).toBe("tx reverted");
        } finally {
            sqlite.close();
        }
    });
});
