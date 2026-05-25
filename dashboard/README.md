# @conduit/dashboard

Next.js 14 App Router + Tailwind + Privy (email/social/wallet login + embedded wallets) + wagmi v2.

## Pages

- `/` — landing
- `/sender` — CSV upload → validate → approve → `BatchRegistry.createBatch`
- `/operator` — live settled-batch feed (indexer GraphQL + on-chain `BatchSettled` watcher)
- `/recipient` — incoming payments by wallet (indexer query)

## Quickstart

```bash
cd dashboard

# pnpm 11 build allowance — see memory.md GO-010
PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true pnpm install

cp .env.example .env.local
# Fill in NEXT_PUBLIC_PRIVY_APP_ID (free at https://dashboard.privy.io)

pnpm dev
```

## Environment

| Var | Default | Required |
|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | — | Required for login/write flows. Without it, read views still work but a warning banner shows. |
| `NEXT_PUBLIC_PONDER_URL` | `http://localhost:42069` | Indexer GraphQL endpoint. |
| `NEXT_PUBLIC_ARC_TESTNET_RPC` | `https://rpc.testnet.arc.network` | RPC for client-side reads + tx submission. |
| `NEXT_PUBLIC_BATCH_REGISTRY` | Phase 2.3 address | Override only if redeployed. |
| `NEXT_PUBLIC_BATCH_ROUTER` | Phase 2.3 address | Override only if redeployed. |

## CSV format

```csv
wallet,amount,currency
0xabc...,100.00,USDC
0xdef...,250.50,USDC
```

- All recipients in one CSV must share a single currency (USDC or EURC; v1 single-corridor per batch).
- `amount` is a human-readable decimal (e.g., `100.00`) — converted to base units client-side via `parseUnits(amount, 6)`.

## Design notes

- Tailwind palette is intentionally muted (`#0a0a0a` ink, `#fafafa` paper, `#0066ff` signal accent) — avoids the "AI slop" purple-gradient look. Pair with `npx impeccable detect src/` in CI when you want strict enforcement (per `memory.md` D-009).
- Tabular figures for any numeric column (`.tabular`).
- Server components by default; only auth/wagmi-touching components are `"use client"`.

## Local dev with the indexer

In another terminal:

```bash
cd indexer
PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true pnpm install
pnpm dev    # serves GraphQL at http://localhost:42069
```

The dashboard's `NEXT_PUBLIC_PONDER_URL` defaults to that endpoint.
