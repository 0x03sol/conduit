/**
 * Tiny GraphQL fetcher for the Ponder indexer. Returns typed results;
 * throws on HTTP error or GraphQL error.
 */
const PONDER_URL = process.env.NEXT_PUBLIC_PONDER_URL ?? "http://localhost:42069";

export async function indexerFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${PONDER_URL}/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        // Avoid Next.js's default route caching for live data.
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Indexer HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) {
        const msg = json.errors.map((e: { message: string }) => e.message).join("; ");
        throw new Error(`Indexer error: ${msg}`);
    }
    return json.data as T;
}

// ───────────── Domain types (mirror Ponder schema) ─────────────

export type IndexedBatchStatus = 0 | 1 | 2 | 3 | 4 | 5;
export const STATUS_LABEL: Record<IndexedBatchStatus, string> = {
    0: "None",
    1: "Pending",
    2: "Funded",
    3: "Executing",
    4: "Settled",
    5: "Reverted",
};

export interface IndexedBatch {
    id: `0x${string}`;
    sender: `0x${string}`;
    totalAmountSum: string;
    recipientCount: number;
    status: IndexedBatchStatus;
    createdAt: string;
    createdTxHash: `0x${string}`;
    settledAt: string | null;
    settledTxHash: `0x${string}` | null;
    totalDistributed: string | null;
}

export interface IndexedRecipient {
    id: string;
    batchId: `0x${string}`;
    index: number;
    wallet: `0x${string}`;
    amount: string;
    outputCurrency: `0x${string}`;
}

// ───────────── Queries ─────────────

const RECENT_SETTLEMENTS_QUERY = /* GraphQL */ `
    query RecentSettlements($limit: Int!) {
        batchs(orderBy: "settledAt", orderDirection: "desc", limit: $limit, where: { status: 4 }) {
            items {
                id
                sender
                totalAmountSum
                totalDistributed
                recipientCount
                status
                createdAt
                createdTxHash
                settledAt
                settledTxHash
            }
        }
    }
`;

export async function fetchRecentSettlements(limit = 25): Promise<IndexedBatch[]> {
    const data = await indexerFetch<{ batchs: { items: IndexedBatch[] } }>(
        RECENT_SETTLEMENTS_QUERY,
        { limit },
    );
    return data.batchs.items;
}

const RECIPIENT_BATCHES_QUERY = /* GraphQL */ `
    query RecipientBatches($wallet: String!, $limit: Int!) {
        recipients(where: { wallet: $wallet }, limit: $limit) {
            items {
                id
                batchId
                index
                wallet
                amount
                outputCurrency
                batch {
                    id
                    status
                    sender
                    settledAt
                    settledTxHash
                }
            }
        }
    }
`;

export interface IndexedRecipientWithBatch extends IndexedRecipient {
    batch: Pick<IndexedBatch, "id" | "status" | "sender" | "settledAt" | "settledTxHash">;
}

export async function fetchRecipientBatches(
    wallet: `0x${string}`,
    limit = 50,
): Promise<IndexedRecipientWithBatch[]> {
    const data = await indexerFetch<{ recipients: { items: IndexedRecipientWithBatch[] } }>(
        RECIPIENT_BATCHES_QUERY,
        { wallet: wallet.toLowerCase(), limit },
    );
    return data.recipients.items;
}

const BATCHES_BY_SENDER_QUERY = /* GraphQL */ `
    query BatchesBySender($sender: String!, $limit: Int!) {
        batchs(where: { sender: $sender }, orderBy: "createdAt", orderDirection: "desc", limit: $limit) {
            items {
                id
                sender
                totalAmountSum
                totalDistributed
                recipientCount
                status
                createdAt
                createdTxHash
                settledAt
                settledTxHash
            }
        }
    }
`;

export async function fetchBatchesBySender(
    sender: `0x${string}`,
    limit = 25,
): Promise<IndexedBatch[]> {
    const data = await indexerFetch<{ batchs: { items: IndexedBatch[] } }>(
        BATCHES_BY_SENDER_QUERY,
        { sender: sender.toLowerCase(), limit },
    );
    return data.batchs.items;
}
