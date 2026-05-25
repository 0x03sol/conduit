import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { relayMessages, kv } from "./schema.js";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

/** Strip the `file:` prefix (we accept both `file:./x.db` and `./x.db`). */
function fileUrlToPath(url: string): string {
    return url.startsWith("file:") ? url.slice("file:".length) : url;
}

/**
 * Open the sqlite DB at `dbUrl`. Creates parent directories if needed and
 * runs an idempotent CREATE TABLE pass (we don't ship drizzle-kit migrations
 * inside the binary; this keeps the relayer single-file friendly).
 */
export function openDb(dbUrl: string): { db: Db; sqlite: Database.Database } {
    const path = fileUrlToPath(dbUrl);
    if (path !== ":memory:") {
        try {
            mkdirSync(dirname(path), { recursive: true });
        } catch {
            // Directory already exists or path is root — ignore.
        }
    }
    const sqlite = new Database(path);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");

    // Inline schema as raw SQL — drizzle-kit migrate is great for prod, but
    // keeping the relayer self-bootstrapping during local + CI tests.
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS relay_messages (
            message_hash    TEXT PRIMARY KEY,
            source_domain   INTEGER NOT NULL,
            dest_domain     INTEGER NOT NULL,
            source_tx_hash  TEXT NOT NULL,
            source_block    INTEGER NOT NULL,
            raw_message     TEXT NOT NULL,
            attestation     TEXT,
            status          TEXT NOT NULL DEFAULT 'seen',
            dest_tx_hash    TEXT,
            error           TEXT,
            attempts        INTEGER NOT NULL DEFAULT 0,
            seen_at         INTEGER NOT NULL,
            attested_at     INTEGER,
            submitted_at    INTEGER,
            confirmed_at    INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_relay_messages_status ON relay_messages(status);
        CREATE INDEX IF NOT EXISTS idx_relay_messages_src_tx ON relay_messages(source_tx_hash);

        CREATE TABLE IF NOT EXISTS kv (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    const db = drizzle(sqlite, { schema });
    return { db, sqlite };
}

export { relayMessages, kv };
