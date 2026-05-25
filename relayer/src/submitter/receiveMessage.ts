import type { Hex, WalletClient, PublicClient } from "viem";
import { encodeFunctionData } from "viem";
import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import { messageTransmitterReceiveAbi } from "../abis.js";
import { type Db, relayMessages } from "../db/client.js";

export interface SubmitterDeps {
    walletClient: WalletClient;
    publicClient: PublicClient;
    db: Db;
    logger: Logger;
    dstMessageTransmitter: `0x${string}`;
}

export interface SubmitArgs {
    messageHash: Hex;
    message: Hex;
    attestation: Hex;
}

/**
 * Submit `MessageTransmitterV2.receiveMessage(message, attestation)` on the
 * destination chain.
 *
 * Idempotent: if the relay row's status is already `submitting` or
 * `confirmed`, returns the existing tx hash (or `null` for `confirmed` if we
 * never persisted the hash for some reason). On a fresh submission the row
 * transitions `attested → submitting → confirmed` (or `failed` on error).
 */
export async function submitReceiveMessage(
    deps: SubmitterDeps,
    args: SubmitArgs,
): Promise<{ txHash: Hex | null; alreadySubmitted: boolean }> {
    const { walletClient, publicClient, db, logger, dstMessageTransmitter } = deps;

    const existing = db
        .select()
        .from(relayMessages)
        .where(eq(relayMessages.messageHash, args.messageHash))
        .get();

    if (existing && (existing.status === "submitting" || existing.status === "confirmed")) {
        return {
            txHash: (existing.destTxHash ?? null) as Hex | null,
            alreadySubmitted: true,
        };
    }

    // Mark submitting BEFORE broadcasting so a concurrent loop can't double up.
    db.update(relayMessages)
        .set({
            status: "submitting",
            attempts: (existing?.attempts ?? 0) + 1,
            submittedAt: new Date(),
        })
        .where(eq(relayMessages.messageHash, args.messageHash))
        .run();

    const data = encodeFunctionData({
        abi: messageTransmitterReceiveAbi,
        functionName: "receiveMessage",
        args: [args.message, args.attestation],
    });

    let txHash: Hex;
    try {
        // walletClient was created with an account + chain, so we just pass
        // the bare tx; viem fills in the rest.
        txHash = await walletClient.sendTransaction({
            to: dstMessageTransmitter,
            data,
        } as Parameters<typeof walletClient.sendTransaction>[0]);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        db.update(relayMessages)
            .set({ status: "failed", error: message.slice(0, 1000) })
            .where(eq(relayMessages.messageHash, args.messageHash))
            .run();
        logger.error({ messageHash: args.messageHash, err: message }, "submitter: send failed");
        throw err;
    }

    db.update(relayMessages)
        .set({ destTxHash: txHash })
        .where(eq(relayMessages.messageHash, args.messageHash))
        .run();
    logger.info({ messageHash: args.messageHash, txHash }, "submitter: tx broadcast");

    // Wait for confirmation. Caller can choose not to await this if they
    // want to fire-and-forget; for v1 we wait for 1 confirmation.
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status === "success") {
        db.update(relayMessages)
            .set({ status: "confirmed", confirmedAt: new Date() })
            .where(eq(relayMessages.messageHash, args.messageHash))
            .run();
        logger.info({ messageHash: args.messageHash, txHash }, "submitter: confirmed");
    } else {
        db.update(relayMessages)
            .set({ status: "failed", error: "tx reverted" })
            .where(eq(relayMessages.messageHash, args.messageHash))
            .run();
        logger.error({ messageHash: args.messageHash, txHash }, "submitter: tx reverted");
    }

    return { txHash, alreadySubmitted: false };
}
