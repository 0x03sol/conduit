#!/usr/bin/env bash
# script/smoke-test-fx-escrow-arc.sh
#
# Phase 2.3.5 end-to-end smoke test on Arc testnet:
#   1. Sign an EIP-712 maker quote (locally, via SignFxQuote.s.sol)
#   2. approve(registry, fee)              [USDC]
#   3. createBatch([(self, 1 EURC, EURC)])
#   4. approve(router, 1 USDC)             [USDC]
#   5. execute(batchId, 1 USDC, 50, extraData)
#   6. Verify BatchSettled + balance reconciliation
#
# Net effect on the deployer wallet (recipient = self, maker = self):
#   USDC: -fee (registry) + amountIn (received as maker) - amountIn (paid in) - gas = -fee - gas
#   EURC: -amountOut (sent as maker) + amountOut (received as recipient) = 0
#   Adapter, escrow, router: 0 each (no retention)
#
# Usage:
#   set -a; source .env; set +a
#   bash script/smoke-test-fx-escrow-arc.sh

set -euo pipefail
: "${DEPLOYER_PK:?DEPLOYER_PK is required (source .env first)}"

ART="deployments/arc-testnet-fx-escrow.json"
[[ -f $ART ]] || { echo "FAIL: $ART not found"; exit 1; }

REGISTRY=$(jq -r '.contracts.BatchRegistry' "$ART")
ROUTER=$(jq -r '.contracts.BatchRouter' "$ART")
ADAPTER=$(jq -r '.contracts.FxEscrowAdapter' "$ART")
ESCROW=$(jq -r '.contracts.MockFxEscrow' "$ART")
USDC=$(jq -r '.usdc' "$ART")
EURC=$(jq -r '.fx.token' "$ART")
FEE=$(jq -r '.registrationFee' "$ART")
DEPLOYER=$(cast wallet address "$DEPLOYER_PK")
RPC=arc_testnet
EURC_TICKER="0x4555524300000000000000000000000000000000000000000000000000000000"

AMOUNT_OUT="${SMOKE_FX_AMOUNT:-1000000}"  # 1 EURC
# 1:1 rate — quote.amountIn == quote.amountOut. (1 USDC ≡ 1 EURC for the demo.)
AMOUNT_IN="$AMOUNT_OUT"
EXPIRY=$(($(date +%s) + 3600))            # 1h from now
NONCE=$(date +%s%N)                       # unique-per-second

cat <<EOF
==================================================
Conduit v1 FX-corridor smoke test [Phase 2.3.5]
  (FxEscrowAdapter + MockFxEscrow + EIP-712)
==================================================
  Registry:   $REGISTRY
  Router:     $ROUTER
  Adapter:    $ADAPTER
  Escrow:     $ESCROW
  USDC:       $USDC
  EURC:       $EURC
  Deployer:   $DEPLOYER  (= maker = recipient)
  amountIn:   $AMOUNT_IN  (USDC base units)
  amountOut:  $AMOUNT_OUT (EURC base units)
  expiry:     $EXPIRY     (unix seconds)
  nonce:      $NONCE
--------------------------------------------------
EOF

bal_usdc() { cast call "$USDC" 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }
bal_eurc() { cast call "$EURC" 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }

# ─── Step 1: sign EIP-712 quote ───────────────────────────────────────────
echo "Step 1/5: sign quote (EIP-712)"
MAKER_PK="$DEPLOYER_PK" \
ADAPTER_ADDR="$ADAPTER" \
QUOTE_TOKEN_IN="$USDC" \
QUOTE_TOKEN_OUT="$EURC" \
QUOTE_AMOUNT_IN="$AMOUNT_IN" \
QUOTE_AMOUNT_OUT="$AMOUNT_OUT" \
QUOTE_TAKER="$ADAPTER" \
QUOTE_EXPIRY="$EXPIRY" \
QUOTE_NONCE="$NONCE" \
forge script script/SignFxQuote.s.sol --rpc-url "$RPC" -vv 2>&1 | grep -E "(digest|Length|Wrote)" | head -3

EXTRA_DATA=$(cat deployments/fx-quote-extra-data.hex)
echo "  extraData head: ${EXTRA_DATA:0:80}..."

# ─── Pre-balances ─────────────────────────────────────────────────────────
D_USDC_BEFORE=$(bal_usdc "$DEPLOYER")
D_EURC_BEFORE=$(bal_eurc "$DEPLOYER")
G_USDC_BEFORE=$(bal_usdc "$REGISTRY")
A_USDC_BEFORE=$(bal_usdc "$ADAPTER")
A_EURC_BEFORE=$(bal_eurc "$ADAPTER")
E_USDC_BEFORE=$(bal_usdc "$ESCROW")
E_EURC_BEFORE=$(bal_eurc "$ESCROW")
R_USDC_BEFORE=$(bal_usdc "$ROUTER")
R_EURC_BEFORE=$(bal_eurc "$ROUTER")
echo ""
echo "Before USDC: dpl=$D_USDC_BEFORE rgy=$G_USDC_BEFORE rtr=$R_USDC_BEFORE adp=$A_USDC_BEFORE esc=$E_USDC_BEFORE"
echo "Before EURC: dpl=$D_EURC_BEFORE rtr=$R_EURC_BEFORE adp=$A_EURC_BEFORE esc=$E_EURC_BEFORE"

# ─── Step 2: approve(registry, fee) ───────────────────────────────────────
echo ""
echo "Step 2/5: approve(registry, $FEE) [USDC]"
cast send "$USDC" 'approve(address,uint256)' "$REGISTRY" "$FEE" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 \
    --json | jq -r '"  tx: \(.transactionHash)"'

# ─── Step 3: createBatch ──────────────────────────────────────────────────
echo "Step 3/5: createBatch([(self, $AMOUNT_OUT, EURC)])"
TUPLE="[($DEPLOYER,$AMOUNT_OUT,$EURC_TICKER)]"
RAW=$(cast send "$REGISTRY" 'createBatch((address,uint256,bytes32)[])' "$TUPLE" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
TX_CREATE=$(echo "$RAW" | jq -r '.transactionHash')
BATCH_ID=$(cast receipt "$TX_CREATE" --rpc-url "$RPC" --json | \
    jq -r --arg r "$REGISTRY" '.logs[] | select(.address|ascii_downcase == ($r|ascii_downcase)) | .topics[1]' | head -1)
echo "  tx: $TX_CREATE"
echo "  batchId: $BATCH_ID"

# ─── Step 4: approve(router, AMOUNT_IN) ───────────────────────────────────
echo "Step 4/5: approve(router, $AMOUNT_IN) [USDC]"
cast send "$USDC" 'approve(address,uint256)' "$ROUTER" "$AMOUNT_IN" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 \
    --json | jq -r '"  tx: \(.transactionHash)"'

# ─── Step 5: execute with extraData ───────────────────────────────────────
echo "Step 5/5: execute(batchId, $AMOUNT_IN, 50, <signed quote>)"
EXEC_RAW=$(cast send "$ROUTER" 'execute(bytes32,uint256,uint16,bytes)' \
    "$BATCH_ID" "$AMOUNT_IN" 50 "$EXTRA_DATA" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
TX_EXEC=$(echo "$EXEC_RAW" | jq -r '.transactionHash')
echo "  tx: $TX_EXEC"

# Verify BatchSettled.
SETTLED_TOPIC=$(cast receipt "$TX_EXEC" --rpc-url "$RPC" --json | \
    jq -r --arg rtr "$ROUTER" '.logs[] | select(.address|ascii_downcase == ($rtr|ascii_downcase)) | .topics[0]')
EXPECTED_TOPIC=$(cast keccak "BatchSettled(bytes32,uint256,uint256)")
if [[ "$SETTLED_TOPIC" != "$EXPECTED_TOPIC" ]]; then
    echo "FAIL: BatchSettled event not found (got $SETTLED_TOPIC, expected $EXPECTED_TOPIC)"
    exit 1
fi
echo "  ✓ BatchSettled fired"

# Also confirm Swapped event from FxEscrowAdapter.
SWAPPED_TOPIC=$(cast receipt "$TX_EXEC" --rpc-url "$RPC" --json | \
    jq -r --arg adp "$ADAPTER" '.logs[] | select(.address|ascii_downcase == ($adp|ascii_downcase)) | .topics[0]' | head -1)
EXPECTED_SWAPPED=$(cast keccak "Swapped(address,address,uint256,uint256,address,uint256)")
[[ "$SWAPPED_TOPIC" == "$EXPECTED_SWAPPED" ]] && echo "  ✓ Swapped fired (adapter)"

# ─── Post-balances + invariants ───────────────────────────────────────────
D_USDC_AFTER=$(bal_usdc "$DEPLOYER")
D_EURC_AFTER=$(bal_eurc "$DEPLOYER")
G_USDC_AFTER=$(bal_usdc "$REGISTRY")
A_USDC_AFTER=$(bal_usdc "$ADAPTER")
A_EURC_AFTER=$(bal_eurc "$ADAPTER")
E_USDC_AFTER=$(bal_usdc "$ESCROW")
E_EURC_AFTER=$(bal_eurc "$ESCROW")
R_USDC_AFTER=$(bal_usdc "$ROUTER")
R_EURC_AFTER=$(bal_eurc "$ROUTER")

echo ""
echo "After USDC:  dpl=$D_USDC_AFTER rgy=$G_USDC_AFTER rtr=$R_USDC_AFTER adp=$A_USDC_AFTER esc=$E_USDC_AFTER"
echo "After EURC:  dpl=$D_EURC_AFTER rtr=$R_EURC_AFTER adp=$A_EURC_AFTER esc=$E_EURC_AFTER"

D_USDC_DELTA=$((D_USDC_AFTER - D_USDC_BEFORE))
D_EURC_DELTA=$((D_EURC_AFTER - D_EURC_BEFORE))
G_USDC_DELTA=$((G_USDC_AFTER - G_USDC_BEFORE))

# Maker-is-self round-trip → deployer EURC delta should be 0 (sent and received self).
[[ "$D_EURC_DELTA" -eq 0 ]] || { echo "FAIL: deployer EURC delta should be 0, got $D_EURC_DELTA"; exit 1; }
# Registry kept the fee.
[[ "$G_USDC_DELTA" -eq "$FEE" ]] || { echo "FAIL: registry USDC delta should be $FEE, got $G_USDC_DELTA"; exit 1; }
# Router holds nothing.
[[ "$((R_USDC_AFTER - R_USDC_BEFORE))" -eq 0 ]] || { echo "FAIL: router USDC delta != 0"; exit 1; }
[[ "$((R_EURC_AFTER - R_EURC_BEFORE))" -eq 0 ]] || { echo "FAIL: router EURC delta != 0"; exit 1; }
# Adapter holds nothing (atomic pass-through).
[[ "$((A_USDC_AFTER - A_USDC_BEFORE))" -eq 0 ]] || { echo "FAIL: adapter USDC delta != 0"; exit 1; }
[[ "$((A_EURC_AFTER - A_EURC_BEFORE))" -eq 0 ]] || { echo "FAIL: adapter EURC delta != 0"; exit 1; }
# Escrow holds nothing.
[[ "$((E_USDC_AFTER - E_USDC_BEFORE))" -eq 0 ]] || { echo "FAIL: escrow USDC delta != 0"; exit 1; }
[[ "$((E_EURC_AFTER - E_EURC_BEFORE))" -eq 0 ]] || { echo "FAIL: escrow EURC delta != 0"; exit 1; }

cat <<EOF
--------------------------------------------------
ALL INVARIANTS HOLD:
  registry kept exactly $FEE (fee)
  router  / adapter / escrow hold 0 (clean atomic pass-through)
  deployer EURC delta:  0 (sent as maker, received as recipient)
  deployer USDC delta:  $D_USDC_DELTA (= -fee - gas)
==================================================
EOF
