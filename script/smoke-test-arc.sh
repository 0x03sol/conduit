#!/usr/bin/env bash
# script/smoke-test-arc.sh
#
# End-to-end smoke test against the live Conduit v1 deployment on Arc testnet.
# Uses `cast send` rather than `forge script` because Arc's USDC calls a
# blocklist precompile at 0x18..0001 that Foundry's local EVM cannot execute
# (logged as GO-009 in memory.md). cast sends txs straight to the RPC, so the
# chain's runtime handles the precompile correctly.
#
# Usage:
#   source .env
#   bash script/smoke-test-arc.sh
#
# Optional env override:
#   SMOKE_AMOUNT  USDC base units sent to recipient = self (default 100_000 = 0.1 USDC)

set -euo pipefail

: "${DEPLOYER_PK:?DEPLOYER_PK is required (source .env first)}"

# ─── Load addresses from deployment artifact ────────────────────────────────
ART="deployments/arc-testnet.json"
[[ -f $ART ]] || { echo "FAIL: $ART not found — run DeployArc.s.sol first"; exit 1; }

REGISTRY=$(jq -r '.contracts.BatchRegistry' "$ART")
ROUTER=$(jq -r '.contracts.BatchRouter' "$ART")
USDC=$(jq -r '.usdc' "$ART")
FEE=$(jq -r '.registrationFee' "$ART")
AMOUNT="${SMOKE_AMOUNT:-100000}" # 0.1 USDC default

DEPLOYER=$(cast wallet address "$DEPLOYER_PK")
RPC=arc_testnet
USDC_TICKER="0x5553444300000000000000000000000000000000000000000000000000000000"  # bytes32("USDC")

# ─── Header ──────────────────────────────────────────────────────────────────
cat <<EOF
==================================================
Conduit v1 smoke test - Arc testnet (cast-driven)
==================================================
  Registry:    $REGISTRY
  Router:      $ROUTER
  USDC:        $USDC
  Deployer:    $DEPLOYER
  Recipient:   $DEPLOYER (self)
  Amount:      $AMOUNT base units
  Fee:         $FEE base units
--------------------------------------------------
EOF

# ─── Pre-balances ────────────────────────────────────────────────────────────
bal() { cast call "$USDC" 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }

D_BEFORE=$(bal "$DEPLOYER")
G_BEFORE=$(bal "$REGISTRY")
R_BEFORE=$(bal "$ROUTER")
echo "Before:  deployer=$D_BEFORE  registry=$G_BEFORE  router=$R_BEFORE"
echo ""

# ─── Step 1: approve registry for fee ───────────────────────────────────────
echo "Step 1/4: approve(registry, $FEE)"
cast send "$USDC" 'approve(address,uint256)' "$REGISTRY" "$FEE" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 \
    --json | jq -r '"  tx: \(.transactionHash)  block: \(.blockNumber)"'

# ─── Step 2: createBatch with 1 self-recipient ───────────────────────────────
echo "Step 2/4: createBatch([(deployer, $AMOUNT, bytes32(\"USDC\"))])"
TUPLE="[($DEPLOYER,$AMOUNT,$USDC_TICKER)]"
RAW=$(cast send "$REGISTRY" 'createBatch((address,uint256,bytes32)[])' "$TUPLE" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
TX_CREATE=$(echo "$RAW" | jq -r '.transactionHash')
echo "  tx: $TX_CREATE  block: $(echo "$RAW" | jq -r '.blockNumber')"

# Pull batchId from BatchCreated event (topic[1] = first indexed param).
LOGS=$(cast receipt "$TX_CREATE" --rpc-url "$RPC" --json)
BATCH_ID=$(echo "$LOGS" | jq -r '.logs[] | select(.address|ascii_downcase == ($r|ascii_downcase)) | .topics[1]' --arg r "$REGISTRY" | head -1)
echo "  batchId: $BATCH_ID"

# ─── Step 3: approve router for funding ─────────────────────────────────────
echo "Step 3/4: approve(router, $AMOUNT)"
cast send "$USDC" 'approve(address,uint256)' "$ROUTER" "$AMOUNT" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 \
    --json | jq -r '"  tx: \(.transactionHash)  block: \(.blockNumber)"'

# ─── Step 4: execute ────────────────────────────────────────────────────────
echo "Step 4/4: execute($BATCH_ID, $AMOUNT, 50)"
EXEC_RAW=$(cast send "$ROUTER" 'execute(bytes32,uint256,uint16)' "$BATCH_ID" "$AMOUNT" 50 \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
TX_EXEC=$(echo "$EXEC_RAW" | jq -r '.transactionHash')
echo "  tx: $TX_EXEC  block: $(echo "$EXEC_RAW" | jq -r '.blockNumber')"

# Look for BatchSettled event from the router.
SETTLED=$(cast receipt "$TX_EXEC" --rpc-url "$RPC" --json | \
    jq -r --arg rtr "$ROUTER" '.logs[] | select(.address|ascii_downcase == ($rtr|ascii_downcase)) | .topics[0]')
echo "  router event topics[0]: $SETTLED"
# keccak256("BatchSettled(bytes32,uint256,uint256)")
EXPECTED_TOPIC=$(cast keccak "BatchSettled(bytes32,uint256,uint256)")
echo "  expected: $EXPECTED_TOPIC"

if [[ "$SETTLED" != "$EXPECTED_TOPIC" ]]; then
    echo "FAIL: BatchSettled event not found"
    exit 1
fi
echo "  ✓ BatchSettled fired"

# ─── Post-balances + invariants ─────────────────────────────────────────────
D_AFTER=$(bal "$DEPLOYER")
G_AFTER=$(bal "$REGISTRY")
R_AFTER=$(bal "$ROUTER")

D_DELTA=$((D_AFTER - D_BEFORE))
G_DELTA=$((G_AFTER - G_BEFORE))
R_DELTA=$((R_AFTER - R_BEFORE))

echo ""
echo "After:   deployer=$D_AFTER  registry=$G_AFTER  router=$R_AFTER"
echo "Deltas:  deployer=$D_DELTA   registry=$G_DELTA   router=$R_DELTA"

# Expectations:
#   Deployer paid only the fee (recipient = self, so AMOUNT round-trips).
#   But deployer ALSO pays gas in USDC. So deployer delta = -fee - gas.
#   Registry kept the fee.
#   Router holds nothing.
EXPECTED_REGISTRY_DELTA=$FEE
EXPECTED_ROUTER_DELTA=0

if [[ "$G_DELTA" -ne "$EXPECTED_REGISTRY_DELTA" ]]; then
    echo "FAIL: registry delta expected $EXPECTED_REGISTRY_DELTA, got $G_DELTA"
    exit 1
fi
if [[ "$R_DELTA" -ne "$EXPECTED_ROUTER_DELTA" ]]; then
    echo "FAIL: router delta expected $EXPECTED_ROUTER_DELTA, got $R_DELTA"
    exit 1
fi

# Deployer delta = -(fee + gas). It must be negative and at most -fee.
if [[ "$D_DELTA" -gt $((-FEE)) ]]; then
    echo "FAIL: deployer delta should be <= $((-FEE)), got $D_DELTA"
    exit 1
fi

cat <<EOF
--------------------------------------------------
ALL INVARIANTS HOLD:
  registry kept exactly $EXPECTED_REGISTRY_DELTA (fee)
  router holds 0 (no retention after settle)
  deployer paid $((-D_DELTA)) total = $FEE fee + $((-D_DELTA - FEE)) gas
==================================================
EOF
