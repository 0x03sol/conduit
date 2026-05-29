# Conduit — Roadmap

Tracks deliberate v2+ work that v1 documents but doesn't ship. Each item is
linked to the audit / review pass it came out of, so the trail back to
"why" is preserved.

## v1 status

The v1 testnet submission ships:

- 4 production contracts: BatchRegistry, BatchRouter, CCTPHookReceiver,
  FxEscrowAdapter (+ MockFxAdapter, MockFxEscrow)
- 157 forge tests passing across 6 suites
- Cross-chain proof-of-life: Sepolia burn → Iris attest → Arc mint →
  BatchSettled fired. Full hash trail in `memory.md § Live deployments`.
- Off-chain: Iris relayer (21 vitest cases), Ponder indexer, Next.js 14
  dashboard

## Security audit follow-ups (from internal review 2026-05-28)

### v1 fixed in this submission

- **H-1 — `processHook*` permissionless dispatch** → closed by `isDispatcher`
  allowlist + `onlyDispatcher` modifier on the three manual-trigger methods
  in `CCTPHookReceiver`. Owner allowlists the relayer's hot wallet at deploy
  time. 3 new tests (`test_ProcessHook_RevertWhen_NotDispatcher`,
  `test_SetDispatcher_*`).
- **M-1 — `BatchRouter.execute(maxSlippageBps)` dead parameter** → kept in
  the function + hookData layout for v2 forward-compat, but documented as
  "v1 reserved" with the explicit v2 plan
  (`minAmountOut = totalNeeded × (10_000 - bps) / 10_000`). v1 enforces
  zero-slippage via the strict `received == totalNeeded` invariant.
- **M-2 — `CCTPHookReceiver` residual balance compounds across batches** →
  observable via the new `Residual(batchId, residualUsdc)` event so
  operators can monitor and call `sweep()` when leftover grows. Attack
  surface closed by H-1; remaining concern is correctness/auditability.
- **M-3 — `IMessageHandlerV2.handleReceive*Message` is dead code for the
  token-burn flow** → annotated with a clarifying NOTE explaining when
  the methods would and would not be reached. Kept solely for interface
  compliance.
- **L-2 — collected registration fees were locked in `BatchRegistry`** →
  added `withdrawFees(address to, uint256 amount)` admin function with 4
  tests covering owner-only, zero-address rejection, full-balance drain
  (amount=0), and partial-amount withdrawal.
- **L-4 — `setRegistrationFee` had no upper bound** → added
  `MAX_REGISTRATION_FEE = 1_000e6` (1000 USDC) constant + `FeeTooHigh`
  revert in both constructor and setter. 2 new tests.
- **Lint hygiene** → suppressed `unsafe-typecast` on intentional
  ASCII→bytes32 ticker conversions (`bytes32("EURC")`, `bytes32("USDC")`,
  etc.) and `erc20-unchecked-transfer` on test mocks where return values
  are not meaningful. Production code is lint-clean.

### Deferred to v2

- **L-1 — Migrate all admin contracts to OZ `Ownable2Step`** *
  Affected: `BatchRegistry`, `FxEscrowAdapter`, `CCTPHookReceiver`. Today's
  inline `address public owner` + `onlyOwner` pattern lacks the two-step
  accept that prevents accidental ownership burn when transferring to a
  multisig. v2 will:
  - Replace inline owner with `Ownable2Step` inheritance
  - Migrate revert path from `NotOwner()` to OZ's
    `OwnableUnauthorizedAccount(address)`
  - Update ~15 existing tests + add `transferOwnership` / `acceptOwnership`
    coverage
  - Update deploy scripts for the post-deploy `transferOwnership(multisig)`
    + `acceptOwnership` two-step

  Reasoning for v1 deferral: single-deploy testnet doesn't yet need
  rotated keys. Visible refactor with high test churn; defer until first
  multisig handover.

- **L-3 — Add OZ `Pausable` to runtime entry points** *
  Affected: `BatchRegistry.createBatch`, `BatchRouter.execute`,
  `CCTPHookReceiver._handle` / `_dispatch`. v2 will:
  - Inherit `Pausable`, add `whenNotPaused` ordered **outside**
    `nonReentrant` on each entry point
  - Add `pause()` / `unpause()` admin functions
  - Add ~18 tests covering pause-ON revert + unpause-resumes flow

  Reasoning for v1 deferral: pausing the receiver mid-CCTP-flight is an
  operational landmine — Iris-attested messages stall until unpause.
  Adding emergency stop without operational runbook is worse than no
  stop. v2 ships with monitoring + runbook.

- **M-2 v2 — Replace `usdc.balanceOf(this)` with explicit per-message
  amount** * Receiver decodes the burn amount from BurnMessageV2 offset
  68 and forwards exactly that amount to the router regardless of contract
  balance. Eliminates the residual-compounding behavior closed by H-1's
  dispatcher gate today. Touches `CCTPHookReceiver._dispatch` and
  `_handle` plus the test fixtures that currently use zero-headed mock
  burn messages.

- **H-1 v2 — Bind a batch dispatch to its source `(srcDomain,
  messageSender)`** * Today's dispatcher allowlist trusts the relayer to
  call only batches that match the legitimate burner. v2 will read
  `messageSender` out of BurnMessageV2 and require the registered
  batch's `sender` to match. Eliminates the trust assumption on the
  relayer entirely.

- **L-5 — Replace fragile CCTP slice (`cctpMessage[376:]`) with a
  length-checked decoder** * Brittle if Circle ever changes the CCTP V2
  header layout. Decoder approach: shape the slice into a typed
  `CCTPMessageV2` struct via `abi.decode` and assert on body offsets.

## Mainnet readiness

Beyond the security follow-ups:

- **Circle Paymaster on Arc** (memory.md Q-006) * Paymaster is documented
  by Circle as supported on Arbitrum + Base + Eth + Optimism + Polygon +
  Unichain + Avalanche; **not yet** on Arc. Without Paymaster, mainnet
  users pay native USDC for gas on Arc (Arc's design point), which works
  but loses the gasless UX. Track the Arc deployment in
  `https://developers.circle.com/paymaster`.
- **Real maker integration for FX corridor** (memory.md D-008) * v1 uses
  the deployer wallet as both taker and maker on `FxEscrowAdapter`.
  Mainnet needs at least one real Circle-onboarded market maker
  allowlisted via `setMakerAllowed`. Until then the FX corridor is a
  closed-loop test fixture, not a real corridor.
- **Avenia BRLA testnet token access** (memory.md, applied 2026-05-25) *
  Awaiting reply. EURC corridor remains the v1 fallback. BRLA support is
  drop-in once tokens are available — `MockFxAdapter` already configures
  by ticker.

## Frontend / off-chain hardening (v2)

- **Privy `<AuthBoundary>` refactor** * Today `usePrivy()` is wrapped in
  `try/catch` in 2 components (`OnboardingTour`, `StartMenu`). React rules
  flag conditional hook usage. v2: extract a `<AuthBoundary>` component
  that gates rendering on `NEXT_PUBLIC_PRIVY_APP_ID` and lets `usePrivy`
  run unconditionally inside.
- **`SWR` migration for live polling** * `SystemTray` and `ArcReadout`
  use raw `fetch()` inside `useEffect`. v2: migrate to `useSWR` for
  caching, dedup, retry, and re-validate-on-focus.
- **`react-globe.gl` + `three` dep removal** * The WebGL globe was
  replaced with a flat 4K wallpaper (still ships in `package.json`).
  `pnpm remove react-globe.gl three` cleans ~150 MB from `node_modules`.
- **Indexer auto-restart** * Ponder dev process hung once during this
  review. v2: run under `pm2` or `systemd` with auto-restart on
  unresponsive health-check.
- **Indexer FX event coverage** * `BatchRouter` indexes only
  `BatchSettled`. Adding `FxEscrowAdapter:Swapped` to the indexer config
  + a `swap` table would let the dashboard show FX leg detail (rate,
  maker, USDC→EURC delta) per settled batch. Useful for Settlement
  Monitor v2.
- **Relayer hook trigger** * The relayer today only submits
  `MessageTransmitterV2.receiveMessage` on the destination chain. After
  the mint lands, hook execution is manual (operator runs a
  `processHook` script). v2: relayer detects mint, then calls
  `processHook` automatically as the next step.
- **Relayer hot wallet → KMS/HSM** * `RELAYER_HOT_WALLET_PK` is plaintext
  in env for v1. Mainnet path: viem's account abstraction over a KMS
  signer (AWS KMS, GCP Cloud HSM, or Fireblocks). Same `WalletClient`
  interface; only the account factory swaps.
- **Async receipt tracking in submitter** * Today `submitReceiveMessage`
  awaits `waitForTransactionReceipt` inline, blocking the loop. Move
  receipt confirmation to a separate worker so the submitter pipeline
  can keep flowing. Arc's sub-second finality makes this fine for v1
  but matters at high throughput.
- **CCTP version sanity check** * Iris responses include `cctpVersion`;
  validate it equals 2 before submitting `receiveMessage` so a stray V1
  message can't accidentally hit the V2 transmitter.

## Documentation parity

- Update `memory.md § Current state` continuously as phases advance.
- Keep `ROADMAP.md` (this file) in sync after every audit pass.
- README in cmd app + Notepad app reflect production state.
