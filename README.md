# Conduit

Cross-chain settlement on Arc Network. A sender burns USDC once on any
CCTP V2 source chain. Recipients receive USDC or EURC on Arc, in one tx.

Live on Arc testnet (chain 5042002). Submission for the Arc Builders
Fund.

## What's in this repo

| Path | What |
|---|---|
| `src/` | Solidity contracts: BatchRegistry, BatchRouter, CCTPHookReceiver, FxEscrowAdapter (+ MockFxAdapter, MockFxEscrow) |
| `test/` | Forge tests — 157 passing across 6 suites |
| `script/` | Deploy + smoke-test scripts |
| `dashboard/` | Next.js 14 desktop dashboard (wagmi v2, viem, Privy) |
| `relayer/` | Iris attestation poller + dst-chain `receiveMessage` submitter (Node.js, vitest) |
| `indexer/` | Ponder indexer (sqlite + drizzle, GraphQL surface) |
| `lib/` | Foundry submodules (forge-std, OpenZeppelin, Permit2) |

## Live deployment (Arc testnet, Phase 4 — audit-fixed 2026-05-28)

| Contract | Address |
|---|---|
| `BatchRegistry` | `0x34705cF46Ddf9f3cE53f5492B6376678BE62F0fc` |
| `BatchRouter` | `0x6eD720FDF5c28cF8895A8049Fe13AF1384d82d20` |
| `CCTPHookReceiver` | `0xAe225c9F39664Ff01D11dA9cD29452a2bE0E8FE3` |
| `FxEscrowAdapter` | `0xB26eF145C041c3d2a1b31ccda8aCB88fe242ab3d` |
| `MockFxEscrow` | `0xbfCf669DC893c66007741AD8812e39405e4D6076` |

Phase 3.2.3 addresses (`0xe495…`, `0x823b…`, etc.) remain on chain as
historical reference. Phase 4 adds the H-1 dispatcher allowlist,
withdrawFees, and MAX_REGISTRATION_FEE — see `ROADMAP.md § Security
audit follow-ups`.

Verified on `https://testnet.arcscan.app`.

## Proven cross-chain flow (2026-05-25)

| Step | Tx |
|---|---|
| Sepolia burn | `0xa70f0cef…4f40253` |
| Iris attest | 24s, 3 polls |
| Arc mint | `0x4f1ea229…0c84ba` |
| Hook dispatch | `0xfc746072…442e2` (BatchSettled fired) |

## Quick start

```bash
# Contracts
forge build && forge test

# Dashboard
cd dashboard && pnpm install && pnpm dev

# Indexer
cd indexer && pnpm install && pnpm dev

# Relayer
cd relayer && pnpm install && pnpm test
```

## Documents

- [`PRODUCT.md`](PRODUCT.md) — product purpose, users, anti-references
- [`DESIGN.md`](DESIGN.md) — visual + interaction design system
- [`ROADMAP.md`](ROADMAP.md) — v2 hardening items (audit follow-ups,
  Ownable2Step, Pausable, Privy AuthBoundary, etc.)
- [`progress.md`](progress.md) — task tracker with phase status
- [`memory.md`](memory.md) — durable cross-session decisions and
  verified addresses
- [`AGENTS.md`](AGENTS.md) — agent entry point and skill activation
  rules
- [`final-dapp.md`](final-dapp.md) — original proposal (architecture,
  primitives, phase plan)

## Stack

- Solidity 0.8.26, Foundry, OpenZeppelin, Permit2
- Circle CCTP V2 (`depositForBurnWithHook` + `MessageTransmitterV2`)
- Circle StableFX `FxEscrow` (Arc testnet)
- Next.js 14, wagmi v2, viem 2, Privy embedded wallets
- Ponder indexer, sqlite, drizzle
- Node.js + viem (Iris poller + receiveMessage submitter)

## License

MIT.
