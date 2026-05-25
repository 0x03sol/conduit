# @conduit/relayer

CCTP V2 attestation relayer for Conduit. Watches a source chain for
`MessageSent` events emitted by `MessageTransmitterV2`, polls Circle's Iris
attestation API, and submits `receiveMessage(message, attestation)` on the
destination chain (Arc testnet for v1).

## Layout

```
relayer/
├── src/
│   ├── index.ts                 main loop (watcher + iris + submitter)
│   ├── config.ts                env-driven, zod-validated
│   ├── log.ts                   pino logger
│   ├── chains.ts                viem chain defs (sepolia + arcTestnet)
│   ├── abis.ts                  minimal CCTP V2 ABI fragments
│   ├── db/
│   │   ├── schema.ts            drizzle sqlite schema (relay_messages, kv)
│   │   └── client.ts            openDb() + idempotent CREATE TABLE
│   ├── iris/
│   │   ├── client.ts            HTTP client with zod validation
│   │   └── poller.ts            exponential backoff
│   ├── watcher/
│   │   └── messageSentWatcher.ts  scanOnce() — getLogs + cursor + dedup
│   └── submitter/
│       └── receiveMessage.ts    idempotent dst-chain submitter
└── tests/
    ├── config.test.ts
    ├── db/schema.test.ts
    ├── iris/client.test.ts
    ├── iris/poller.test.ts
    └── submitter/dedupe.test.ts
```

## Quickstart

```bash
cd relayer

# pnpm 11 blocks build scripts by default; we need better-sqlite3's native
# build to compile and esbuild's postinstall to fetch its binary. Either:
#
#   (A) one-time env-var install:
PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true pnpm install

#   (B) or run pnpm approve-builds interactively after a plain install:
# pnpm install
# pnpm approve-builds   # answer yes for better-sqlite3 + esbuild

cp .env.example .env       # fill in DEPLOYER / hot-wallet PK + RPCs

# Run unit tests
pnpm test

# Run the relayer
pnpm dev
```

## Lifecycle

The relayer maintains a per-message row in `relay_messages` keyed by
`keccak256(message)`:

```
seen → attested → submitting → confirmed
                              \→ failed
```

- `seen`: a `MessageSent` log was observed on the source chain.
- `attested`: Iris returned `status=complete` and we cached the attestation.
- `submitting`: a `receiveMessage` tx was broadcast to the destination chain.
- `confirmed`: the tx was mined successfully.
- `failed`: unrecoverable error. Manual intervention required.

## Idempotency

- The DB primary key is `messageHash = keccak256(message)`.
- `submitReceiveMessage` short-circuits if a row is already `submitting` or
  `confirmed`. Re-running the relayer or restarting after a crash never
  double-submits.
- The watcher uses `INSERT ... ON CONFLICT DO NOTHING` — re-observing a log
  is a no-op.

## Operational notes

- One `MessageTransmitterV2` per chain. Configure via `*_MESSAGE_TRANSMITTER`
  env vars. Verify against `developers.circle.com/cctp/evm-smart-contracts`
  before each deploy.
- Iris API has a 35 req/s rate limit (per Circle's docs).
- The hot wallet on the destination chain must hold native gas (USDC on Arc).
- Confirmations: Sepolia → 12, Arc → 1 (sub-second deterministic finality).

## What's missing (deferred)

- Live integration test against forked Sepolia + Arc (Phase 3.2.3).
- Prometheus metrics export.
- WebSocket-based event subscription (currently polls via `getLogs`).
- Retry queue with explicit dead-letter handling beyond status=`failed`.
- Reorg awareness (relies on `srcConfirmations`).
