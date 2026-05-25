import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { openDb, relayMessages, kv } from "../../src/db/client.js";

describe("db schema", () => {
    it("creates tables and round-trips a relay message", () => {
        const { db, sqlite } = openDb("file::memory:");
        try {
            const now = new Date();
            db.insert(relayMessages)
                .values({
                    messageHash: "0xhash1",
                    sourceDomain: 0,
                    destDomain: 1,
                    sourceTxHash: "0xtx1",
                    sourceBlock: 100,
                    rawMessage: "0xdeadbeef",
                    status: "seen",
                    attempts: 0,
                    seenAt: now,
                })
                .run();

            const got = db.select().from(relayMessages).where(eq(relayMessages.messageHash, "0xhash1")).get();
            expect(got).toBeDefined();
            expect(got!.sourceTxHash).toBe("0xtx1");
            expect(got!.status).toBe("seen");
            expect(got!.attempts).toBe(0);
        } finally {
            sqlite.close();
        }
    });

    it("dedupes by messageHash via onConflictDoNothing", () => {
        const { db, sqlite } = openDb("file::memory:");
        try {
            const seenAt = new Date();
            const insert = () =>
                db
                    .insert(relayMessages)
                    .values({
                        messageHash: "0xdup",
                        sourceDomain: 0,
                        destDomain: 1,
                        sourceTxHash: "0xtx",
                        sourceBlock: 1,
                        rawMessage: "0xdead",
                        seenAt,
                    })
                    .onConflictDoNothing({ target: relayMessages.messageHash })
                    .run();

            const first = insert();
            const second = insert();
            expect(first.changes).toBe(1);
            expect(second.changes).toBe(0);

            const rows = db.select().from(relayMessages).all();
            expect(rows).toHaveLength(1);
        } finally {
            sqlite.close();
        }
    });

    it("upserts kv via onConflictDoUpdate", () => {
        const { db, sqlite } = openDb("file::memory:");
        try {
            db.insert(kv)
                .values({ key: "cursor", value: "100" })
                .onConflictDoUpdate({ target: kv.key, set: { value: "100" } })
                .run();
            db.insert(kv)
                .values({ key: "cursor", value: "200" })
                .onConflictDoUpdate({ target: kv.key, set: { value: "200" } })
                .run();
            const got = db.select().from(kv).where(eq(kv.key, "cursor")).get();
            expect(got?.value).toBe("200");
        } finally {
            sqlite.close();
        }
    });
});
