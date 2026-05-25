# @conduit/indexer

Ponder indexer for Conduit's on-chain events on Arc testnet.

## Indexed events

- `BatchRegistry.BatchCreated` → inserts a `batch` row + reads the recipient
  array back from the contract to populate `recipient` rows.
- `BatchRegistry.StatusUpdated` → appends to `status_update` history and
  updates `batch.status`.
- `BatchRouter.BatchSettled` → marks the batch as Settled with the actual
  distributed amount.

## Schema

- `batch` (id, sender, totalAmountSum, recipientCount, status, …)
- `recipient` (id, batchId, index, wallet, amount, outputCurrency)
- `status_update` (id, batchId, oldStatus, newStatus, block, timestamp, txHash)

Relations:
- `batch.recipients` → many `recipient`
- `batch.statusHistory` → many `status_update`

## Quickstart

```bash
cd indexer

# pnpm 11 native-build allowance (per memory.md GO-010):
PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true pnpm install

cp .env.example .env.local

# Run the indexer (autogenerates a GraphQL endpoint at http://localhost:42069/graphql)
pnpm dev
```

## Targeting

The config points at Phase 2.3 contracts on Arc testnet:
- BatchRegistry: `0x823b34D7FBa61628cE3e665F86f715e823657A17` (block 43964622)
- BatchRouter:   `0x1a8F8B0aA5fe50c3c9B48E5aCA56aBe2CE52452f` (block 43964624)

To switch deployments, edit `ponder.config.ts`.

## Sample query

```graphql
query RecentSettlements {
  batchs(orderBy: "settledAt", orderDirection: "desc", limit: 25,
         where: { status: 4 }) {
    items {
      id
      sender
      totalDistributed
      settledAt
      settledTxHash
      recipients { items { wallet amount outputCurrency } }
    }
  }
}
```
