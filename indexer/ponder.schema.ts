import { onchainTable, relations, index } from "ponder";

/**
 * One row per batch ever registered.
 * Status enum mirrors src/BatchRegistry.sol: 0=None 1=Pending 2=Funded 3=Executing 4=Settled 5=Reverted.
 */
export const batch = onchainTable(
    "batch",
    (t) => ({
        id: t.hex().primaryKey(),                  // bytes32 batchId
        sender: t.hex().notNull(),
        totalAmountSum: t.bigint().notNull(),       // sum of recipient.amount across recipients (in target currency base units)
        recipientCount: t.integer().notNull(),
        status: t.integer().notNull().default(1),   // Pending after BatchCreated
        registrationFee: t.bigint(),                 // current fee at creation time (filled by handler if available)
        createdBlock: t.bigint().notNull(),
        createdAt: t.bigint().notNull(),             // unix timestamp seconds
        createdTxHash: t.hex().notNull(),
        settledBlock: t.bigint(),
        settledAt: t.bigint(),
        settledTxHash: t.hex(),
        totalDistributed: t.bigint(),                // from BatchSettled event
    }),
    (t) => ({
        senderIdx: index().on(t.sender),
        statusIdx: index().on(t.status),
    }),
);

/**
 * One row per (batch, index) pair. We pull these from BatchRegistry.getRecipients
 * inside the BatchCreated handler.
 */
export const recipient = onchainTable(
    "recipient",
    (t) => ({
        id: t.text().primaryKey(),                  // `${batchId}-${index}`
        batchId: t.hex().notNull(),
        index: t.integer().notNull(),
        wallet: t.hex().notNull(),
        amount: t.bigint().notNull(),
        outputCurrency: t.hex().notNull(),           // bytes32 ticker
    }),
    (t) => ({
        walletIdx: index().on(t.wallet),
        batchIdx: index().on(t.batchId),
    }),
);

/**
 * Append-only audit trail of StatusUpdated events. Useful for dashboard
 * timelines + debugging.
 */
export const statusUpdate = onchainTable("status_update", (t) => ({
    id: t.text().primaryKey(),                       // `${txHash}-${logIndex}`
    batchId: t.hex().notNull(),
    oldStatus: t.integer().notNull(),
    newStatus: t.integer().notNull(),
    block: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
    txHash: t.hex().notNull(),
}));

// ────────────── Relations ──────────────

export const batchRelations = relations(batch, ({ many }) => ({
    recipients: many(recipient),
    statusHistory: many(statusUpdate),
}));

export const recipientRelations = relations(recipient, ({ one }) => ({
    batch: one(batch, {
        fields: [recipient.batchId],
        references: [batch.id],
    }),
}));

export const statusUpdateRelations = relations(statusUpdate, ({ one }) => ({
    batch: one(batch, {
        fields: [statusUpdate.batchId],
        references: [batch.id],
    }),
}));
