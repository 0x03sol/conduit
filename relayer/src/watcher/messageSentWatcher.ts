import type { Hex, PublicClient } from "viem";
import { keccak256 } from "viem";
import { eq } from "drizzle-orm";

import { messageSentEvent } from "../abis.js";
import { type Db, kv, relayMessages } from "../db/client.js";
import type { Logger } from "pino";

const CURSOR_KEY_PREFIX = "src_cursor_block:";

export interface WatcherDeps {
    client: PublicClient;
    db: Db;
    logger: Logger;
    sourceDomain: number;
    destDomain: number;
    messageTransmitter: `0x${string}`;
    /** Block to begin scanning from on first run (no cursor present). */
    startBlock: bigint;
    /** Confirmations to wait before processing a log. */
    confirmations: bigint;
    /** Max blocks per getLogs call (provider-specific cap). */
    chunkSize?: bigint;
}

/**
 * Polls the source chain for `MessageSent` events emitted by
 * MessageTransmitterV2 and persists each unique message to the relay table.
 *
 * Idempotent by `messageHash` (PRIMARY KEY): re-observing the same log is a
 * no-op. Uses a per-source cursor in the kv table to avoid re-scanning.
 */
export async function scanOnce(deps: WatcherDeps): Promise<{ scanned: bigint; inserted: number }> {
    const { client, db, logger, sourceDomain, messageTransmitter, confirmations } = deps;
    const chunkSize = deps.chunkSize ?? 1_000n;

    const head = await client.getBlockNumber();
    const safeHead = head > confirmations ? head - confirmations : 0n;

    const cursorKey = `${CURSOR_KEY_PREFIX}${sourceDomain}`;
    const cursorRow = db.select({ value: kv.value }).from(kv).where(eq(kv.key, cursorKey)).get();
    const cursor = cursorRow ? BigInt(cursorRow.value) : deps.startBlock;

    if (cursor >= safeHead) {
        logger.debug({ cursor: cursor.toString(), safeHead: safeHead.toString() }, "watcher: caught up");
        return { scanned: 0n, inserted: 0 };
    }

    const fromBlock = cursor + 1n;
    const toBlock = fromBlock + chunkSize - 1n > safeHead ? safeHead : fromBlock + chunkSize - 1n;

    logger.info(
        { fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), domain: sourceDomain },
        "watcher: scanning",
    );

    const logs = await client.getLogs({
        address: messageTransmitter,
        event: messageSentEvent,
        fromBlock,
        toBlock,
    });

    let inserted = 0;
    const seenAt = new Date();
    for (const log of logs) {
        const message = log.args.message as Hex | undefined;
        if (!message) continue;
        const messageHash = keccak256(message);
        const result = db
            .insert(relayMessages)
            .values({
                messageHash,
                sourceDomain,
                destDomain: deps.destDomain,
                sourceTxHash: log.transactionHash!,
                sourceBlock: Number(log.blockNumber!),
                rawMessage: message,
                status: "seen",
                attempts: 0,
                seenAt,
            })
            .onConflictDoNothing({ target: relayMessages.messageHash })
            .run();
        if (result.changes > 0) {
            inserted += 1;
            logger.info(
                {
                    messageHash,
                    txHash: log.transactionHash,
                    block: log.blockNumber?.toString(),
                },
                "watcher: new message",
            );
        }
    }

    db.insert(kv)
        .values({ key: cursorKey, value: toBlock.toString() })
        .onConflictDoUpdate({ target: kv.key, set: { value: toBlock.toString() } })
        .run();

    return { scanned: toBlock - fromBlock + 1n, inserted };
}
