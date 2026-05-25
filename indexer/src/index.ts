import { ponder } from "ponder:registry";
import { batch, recipient, statusUpdate } from "ponder:schema";

/**
 * BatchRegistry.BatchCreated:
 *   - Insert the batch header
 *   - Read the recipient list back from the registry contract and persist
 *     each recipient row (joined to the batch via batchId).
 */
ponder.on("BatchRegistry:BatchCreated", async ({ event, context }) => {
    const args = event.args;
    const batchId = args.batchId;

    await context.db.insert(batch).values({
        id: batchId,
        sender: args.sender,
        totalAmountSum: args.totalAmountSum,
        recipientCount: Number(args.recipientCount),
        status: 1, // Pending
        createdBlock: event.block.number,
        createdAt: event.block.timestamp,
        createdTxHash: event.transaction.hash,
    });

    // Fetch the recipient list from chain for this batchId. Ponder retries on
    // RPC errors automatically. If the read fails permanently the batch row
    // still exists, just without per-recipient detail.
    const rs = await context.client.readContract({
        abi: context.contracts.BatchRegistry.abi,
        address: context.contracts.BatchRegistry.address,
        functionName: "getRecipients",
        args: [batchId],
    });

    for (let i = 0; i < rs.length; i++) {
        const r = rs[i]!;
        await context.db.insert(recipient).values({
            id: `${batchId}-${i}`,
            batchId,
            index: i,
            wallet: r.wallet,
            amount: r.amount,
            outputCurrency: r.outputCurrency,
        });
    }
});

/**
 * BatchRegistry.StatusUpdated: append to history + update batch.status.
 */
ponder.on("BatchRegistry:StatusUpdated", async ({ event, context }) => {
    const { batchId, oldStatus, newStatus } = event.args;

    await context.db.insert(statusUpdate).values({
        id: `${event.transaction.hash}-${event.log.logIndex}`,
        batchId,
        oldStatus: Number(oldStatus),
        newStatus: Number(newStatus),
        block: event.block.number,
        timestamp: event.block.timestamp,
        txHash: event.transaction.hash,
    });

    await context.db
        .update(batch, { id: batchId })
        .set({ status: Number(newStatus) });
});

/**
 * BatchRouter.BatchSettled: emitted after distribution succeeds. Mark the
 * batch as settled with the actual distributed amount (= totalAmountSum
 * usually, but tracked separately for audit clarity).
 */
ponder.on("BatchRouter:BatchSettled", async ({ event, context }) => {
    const { batchId, totalDistributed } = event.args;

    await context.db.update(batch, { id: batchId }).set({
        status: 4, // Settled (matches enum)
        settledBlock: event.block.number,
        settledAt: event.block.timestamp,
        settledTxHash: event.transaction.hash,
        totalDistributed,
    });
});
