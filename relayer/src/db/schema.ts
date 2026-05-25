import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Lifecycle of a CCTP V2 message handled by the relayer:
 *
 *   seen     → MessageSent log observed on src chain
 *   attested → Iris returned status=complete
 *   submitting → receiveMessage tx broadcast to dst chain (in mempool)
 *   confirmed → receiveMessage tx mined on dst
 *   failed   → unrecoverable error (manual intervention required)
 */
export type RelayStatus = "seen" | "attested" | "submitting" | "confirmed" | "failed";

export const relayMessages = sqliteTable("relay_messages", {
    /** keccak256(message) — primary dedup key. */
    messageHash: text("message_hash").primaryKey(),

    sourceDomain: integer("source_domain").notNull(),
    destDomain: integer("dest_domain").notNull(),

    /** Tx hash of the source-chain MessageSent emitter. */
    sourceTxHash: text("source_tx_hash").notNull(),
    /** Block number of the source-chain emitter. */
    sourceBlock: integer("source_block").notNull(),

    /** Raw `bytes message` from the MessageSent event (hex with 0x prefix). */
    rawMessage: text("raw_message").notNull(),

    /** Iris attestation (hex with 0x prefix). NULL until attested. */
    attestation: text("attestation"),

    status: text("status", { enum: ["seen", "attested", "submitting", "confirmed", "failed"] })
        .notNull()
        .default("seen"),

    /** Tx hash on the destination chain (after submitting). */
    destTxHash: text("dest_tx_hash"),

    /** Last error message if status = 'failed'. */
    error: text("error"),

    /** Number of submission attempts so far. */
    attempts: integer("attempts").notNull().default(0),

    seenAt: integer("seen_at", { mode: "timestamp_ms" }).notNull(),
    attestedAt: integer("attested_at", { mode: "timestamp_ms" }),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
});

export type RelayMessage = typeof relayMessages.$inferSelect;
export type NewRelayMessage = typeof relayMessages.$inferInsert;

/**
 * Generic key/value table for relayer state — mainly the source-chain
 * cursor (last block scanned for MessageSent). Could grow to track
 * other state later (e.g., per-domain nonce counters).
 */
export const kv = sqliteTable("kv", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
});
