import { createPublicClient, createWalletClient, http, type Chain, type Hex, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { eq } from "drizzle-orm";

import { loadConfig } from "./config.js";
import { createLogger } from "./log.js";
import { sepolia, arcTestnet } from "./chains.js";
import { openDb, relayMessages } from "./db/client.js";
import { IrisClient } from "./iris/client.js";
import { waitForAttestation } from "./iris/poller.js";
import { scanOnce } from "./watcher/messageSentWatcher.js";
import { submitReceiveMessage } from "./submitter/receiveMessage.js";

function chainFor(chainId: number): Chain {
    if (chainId === sepolia.id) return sepolia;
    if (chainId === arcTestnet.id) return arcTestnet;
    throw new Error(`Unsupported chain id ${chainId}`);
}

async function processSeen(deps: {
    iris: IrisClient;
    db: ReturnType<typeof openDb>["db"];
    logger: ReturnType<typeof createLogger>;
    sourceDomain: number;
}): Promise<void> {
    const { iris, db, logger, sourceDomain } = deps;
    const seen = db
        .select()
        .from(relayMessages)
        .where(eq(relayMessages.status, "seen"))
        .all();

    for (const row of seen) {
        try {
            const messages = await iris.fetchByTx(sourceDomain, row.sourceTxHash as Hex);
            const ready = messages.find((m) => m.status === "complete" && m.attestation);
            if (!ready || !ready.attestation) {
                logger.debug({ messageHash: row.messageHash }, "iris: not ready");
                continue;
            }
            db.update(relayMessages)
                .set({
                    attestation: ready.attestation,
                    status: "attested",
                    attestedAt: new Date(),
                })
                .where(eq(relayMessages.messageHash, row.messageHash))
                .run();
            logger.info({ messageHash: row.messageHash }, "iris: attested");
        } catch (err) {
            logger.warn(
                { messageHash: row.messageHash, err: err instanceof Error ? err.message : String(err) },
                "iris: fetch failed (will retry)",
            );
        }
    }
}

async function processAttested(deps: {
    walletClient: WalletClient;
    publicClient: PublicClient;
    db: ReturnType<typeof openDb>["db"];
    logger: ReturnType<typeof createLogger>;
    dstMessageTransmitter: `0x${string}`;
}): Promise<void> {
    const { walletClient, publicClient, db, logger, dstMessageTransmitter } = deps;
    const ready = db
        .select()
        .from(relayMessages)
        .where(eq(relayMessages.status, "attested"))
        .all();

    for (const row of ready) {
        if (!row.attestation) continue;
        try {
            await submitReceiveMessage(
                { walletClient, publicClient, db, logger, dstMessageTransmitter },
                {
                    messageHash: row.messageHash as Hex,
                    message: row.rawMessage as Hex,
                    attestation: row.attestation as Hex,
                },
            );
        } catch (err) {
            logger.error(
                { messageHash: row.messageHash, err: err instanceof Error ? err.message : String(err) },
                "submit failed (will retry)",
            );
        }
    }
}

async function main(): Promise<void> {
    const cfg = loadConfig();
    const logger = createLogger(cfg.logLevel);
    logger.info(
        {
            srcChainId: cfg.srcChainId,
            dstChainId: cfg.dstChainId,
            irisBase: cfg.irisBase,
            dbUrl: cfg.dbUrl,
        },
        "relayer: starting",
    );

    const srcChain = chainFor(cfg.srcChainId);
    const dstChain = chainFor(cfg.dstChainId);

    const srcClient = createPublicClient({ chain: srcChain, transport: http(cfg.srcRpcUrl) });
    const dstClient = createPublicClient({ chain: dstChain, transport: http(cfg.dstRpcUrl) });
    const account = privateKeyToAccount(cfg.relayerPk as Hex);
    const dstWallet = createWalletClient({ account, chain: dstChain, transport: http(cfg.dstRpcUrl) });

    const { db, sqlite } = openDb(cfg.dbUrl);
    const iris = new IrisClient({ baseUrl: cfg.irisBase });

    let stopping = false;
    const ac = new AbortController();
    const onSignal = () => {
        if (stopping) return;
        stopping = true;
        logger.info("relayer: shutdown signal received");
        ac.abort();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    while (!stopping) {
        try {
            const result = await scanOnce({
                client: srcClient,
                db,
                logger,
                sourceDomain: cfg.srcCctpDomain,
                destDomain: cfg.dstCctpDomain,
                messageTransmitter: cfg.srcMessageTransmitter as `0x${string}`,
                startBlock: BigInt(cfg.srcStartBlock),
                confirmations: BigInt(cfg.srcConfirmations),
            });
            if (result.inserted > 0) {
                logger.info({ inserted: result.inserted }, "watcher: persisted new messages");
            }
        } catch (err) {
            logger.error({ err: err instanceof Error ? err.message : String(err) }, "watcher: error");
        }

        await processSeen({ iris, db, logger, sourceDomain: cfg.srcCctpDomain });

        await processAttested({
            walletClient: dstWallet,
            publicClient: dstClient,
            db,
            logger,
            dstMessageTransmitter: cfg.dstMessageTransmitter as `0x${string}`,
        });

        // Compose a single sleep that's the SHORTER of the two cadences.
        const sleepMs = Math.min(cfg.watcherPollIntervalMs, cfg.attestPollIntervalMs);
        await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, sleepMs);
            ac.signal.addEventListener("abort", () => {
                clearTimeout(t);
                resolve();
            });
        });
    }

    sqlite.close();
    logger.info("relayer: stopped");
}

// Run if invoked directly.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
    main().catch((err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        process.exit(1);
    });
}

export { processSeen, processAttested };
