import "dotenv/config";
import { z } from "zod";

const Hex = z.string().regex(/^0x[0-9a-fA-F]+$/, "must be 0x-prefixed hex");
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");
const PrivKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte private key");
const PortableUint = z.coerce.number().int().nonnegative();

const ConfigSchema = z.object({
    irisBase: z.string().url(),

    srcChainId: PortableUint,
    srcRpcUrl: z.string().url(),
    srcCctpDomain: PortableUint,
    srcMessageTransmitter: Address,
    srcStartBlock: PortableUint.default(0),
    srcConfirmations: PortableUint.default(12),

    dstChainId: PortableUint,
    dstRpcUrl: z.string().url(),
    dstCctpDomain: PortableUint,
    dstMessageTransmitter: Address,

    relayerPk: PrivKey,
    dbUrl: z.string().regex(/^file:/, "RELAYER_DB_URL must be a file:// URL").default("file:./data/relayer.db"),

    logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    watcherPollIntervalMs: PortableUint.default(5_000),
    attestPollIntervalMs: PortableUint.default(8_000),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load config from process.env. Throws (with field-level errors) if any
 * required key is missing or malformed. Call once at startup.
 */
export function loadConfig(): Config {
    const raw = {
        irisBase: process.env.IRIS_BASE ?? "https://iris-api-sandbox.circle.com",
        srcChainId: process.env.SRC_CHAIN_ID,
        srcRpcUrl: process.env.SRC_RPC_URL,
        srcCctpDomain: process.env.SRC_CCTP_DOMAIN,
        srcMessageTransmitter: process.env.SRC_MESSAGE_TRANSMITTER,
        srcStartBlock: process.env.SRC_START_BLOCK,
        srcConfirmations: process.env.SRC_CONFIRMATIONS,
        dstChainId: process.env.DST_CHAIN_ID,
        dstRpcUrl: process.env.DST_RPC_URL,
        dstCctpDomain: process.env.DST_CCTP_DOMAIN,
        dstMessageTransmitter: process.env.DST_MESSAGE_TRANSMITTER,
        relayerPk: process.env.RELAYER_HOT_WALLET_PK,
        dbUrl: process.env.RELAYER_DB_URL,
        logLevel: process.env.RELAYER_LOG_LEVEL,
        watcherPollIntervalMs: process.env.WATCHER_POLL_INTERVAL_MS,
        attestPollIntervalMs: process.env.ATTEST_POLL_INTERVAL_MS,
    };

    const result = ConfigSchema.safeParse(raw);
    if (!result.success) {
        const errors = result.error.errors
            .map((e) => `  ${e.path.join(".")}: ${e.message}`)
            .join("\n");
        throw new Error(`Invalid relayer config:\n${errors}`);
    }
    return result.data;
}

// Used internally by tests to skip env loading.
export { ConfigSchema };
