import { describe, it, expect } from "vitest";
import { ConfigSchema } from "../src/config.js";

const VALID = {
    irisBase: "https://iris-api-sandbox.circle.com",
    srcChainId: 11155111,
    srcRpcUrl: "https://sepolia.example",
    srcCctpDomain: 0,
    srcMessageTransmitter: "0x" + "ab".repeat(20),
    srcStartBlock: 0,
    srcConfirmations: 12,
    dstChainId: 5042002,
    dstRpcUrl: "https://rpc.testnet.arc.network",
    dstCctpDomain: 5,
    dstMessageTransmitter: "0x" + "cd".repeat(20),
    relayerPk: "0x" + "11".repeat(32),
    dbUrl: "file:./data/test.db",
    logLevel: "info",
    watcherPollIntervalMs: 5_000,
    attestPollIntervalMs: 8_000,
};

describe("ConfigSchema", () => {
    it("accepts a valid full config", () => {
        const r = ConfigSchema.safeParse(VALID);
        expect(r.success).toBe(true);
    });

    it("rejects malformed addresses", () => {
        const r = ConfigSchema.safeParse({ ...VALID, srcMessageTransmitter: "0xnothex" });
        expect(r.success).toBe(false);
    });

    it("rejects malformed private keys", () => {
        const r = ConfigSchema.safeParse({ ...VALID, relayerPk: "0xshort" });
        expect(r.success).toBe(false);
    });

    it("rejects RPC URLs without scheme", () => {
        const r = ConfigSchema.safeParse({ ...VALID, srcRpcUrl: "sepolia.example" });
        expect(r.success).toBe(false);
    });

    it("coerces string-numbers from env", () => {
        const r = ConfigSchema.safeParse({ ...VALID, srcChainId: "11155111" });
        expect(r.success).toBe(true);
    });

    it("requires file: scheme on dbUrl", () => {
        const r = ConfigSchema.safeParse({ ...VALID, dbUrl: "sqlite://./test.db" });
        expect(r.success).toBe(false);
    });
});
