#!/usr/bin/env bash
# script/smoke-test-fx-arc.sh
#
# End-to-end smoke test of the Conduit v1 FX corridor on Arc testnet.
# Same shape as smoke-test-arc.sh but exercises the EURC swap path through
# MockFxAdapter. Per GO-009 we use cast send (not forge script) because of
# Arc's blocklist precompile.
#
# Lifecycle:
#   1. approve(registry, fee)              [USDC]
#   2. createBatch([(self, 1 EURC, EURC)])
#   3. approve(router, 1 USDC)
#   4. execute(batchId, 1 USDC, 50, "")    → adapter swaps USDC → EURC
#                                          → router distributes EURC to self
#   5. Verify BatchSettled event + balance deltas
#
# Net effect on the deployer wallet (recipient = self):
#   USDC: -fee (registry kept) - gas
#   EURC: 0 (1 EURC arrives back from the swap, 0 was sent — the adapter's
#            reserve covered it)
#   Adapter: +1 USDC (swap input), -1 EURC (swap output)
#
# Usage:
#   set -a; source .env; set +a
#   bash script/smoke-test-fx-arc.sh
#
# Optional env override:
#   SMOKE_FX_AMOUNT  EURC base units to recipient (default 1_000_000 = 1 EURC).
#                    fundedAmount = SMOKE_FX_AMOUNT (1:1 rate at deploy time).

set -euo pipefail

: "${DEPLOYER_PK:?DEPLOYER_PK is required (source .env first)}"

ART="deployments/arc-testnet-fx.json"
[[ -f $ART ]] || { echo "FAIL: $ART not found — run DeployArcFX.s.sol first"; exit 1; }

REGISTRY=$(jq -r '.contracts.BatchRegistry' "$ART")
ROUTER=$(jq -r '.contracts.BatchRouter' "$ART")
ADAPTER=$(jq -r '.contracts.MockFxAdapter' "$ART")
USDC=$(jq -r '.usdc' "$ART")
EURC=$(jq -r '.fx.token' "$ART")
FEE=$(jq -r '.registrationFee' "$ART")
RATE=$(jq -r '.fx.rate1e6' "$ART")
AMOUNT="${SMOKE_FX_AMOUNT:-1000000}" # 1 EURC default
DEPLOYER=$(cast wallet address "$DEPLOYER_PK")
RPC=arc_testnet
EURC_TICKER="0x4555524300000000000000000000000000000000000000000000000000000000"  # bytes32("EURC")

# fundedAmount = recipientAmount * 1e6 / rate. With rate=1e6 → fundedAmount = recipientAmount.
FUNDED=$(( AMOUNT * 1000000 / RATE ))

cat <<EOF
==================================================
Conduit v1 FX-corridor smoke test (USDC → EURC)
==================================================
  Registry:   $REGISTRY
  Router:     $ROUTER
  Adapter:    $ADAPTER
  USDC:       $USDC
  EURC:       $EURC
  Deployer:   $DEPLOYER
  Recipient:  $DEPLOYER (self)
  Amount:     $AMOUNT EURC base units
  Funded:     $FUNDED USDC base units (rate $RATE / 1e6)
  Fee:        $FEE USDC base units
--------------------------------------------------
EOF

bal_usdc() { cast call "$USDC" 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }
bal_eurc() { cast call "$EURC" 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }

D_USDC_BEFORE=$(bal_usdc "$DEPLOYER")
D_EURC_BEFORE=$(bal_eurc "$DEPLOYER")
G_USDC_BEFORE=$(bal_usdc "$REGISTRY")
A_USDC_BEFORE=$(bal_usdc "$ADAPTER")
A_EURC_BEFORE=$(bal_eurc "$ADAPTER")
R_USDC_BEFORE=$(bal_usdc "$ROUTER")
R_EURC_BEFORE=$(bal_eurc "$ROUTER")

cat <<EOF
Before USDC: deployer=$D_USDC_BEFORE  registry=$G_USDC_BEFORE  router=$R_USDC_BEFORE  adapter=$A_USDC_BEFORE
Before EURC: deployer=$D_EURC_BEFORE  router=$R_EURC_BEFORE  adapter=$A_EURC_BEFORE

EOF

# ─── Step 1: approve registry for fee ───
echo "Step 1/4: approve(registry, $FEE) [USDC]"
cast send "$USDC" 'approve(address,uint256)' "$REGISTRY" "$FEE" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 \
    --json | jq -r '"  tx: \(.transactionHash)"'

# ─── Step 2: createBatch with 1 self-recipient (EURC) ───
echo "Step 2/4: createBatch([(self, $AMOUNT, bytes32(\"EURC\"))])"
TUPLE="[($DEPLOYER,$AMOUNT,$EURC_TICKER)]"
RAW=$(cast send "$REGISTRY" 'createBatch((address,uint256,bytes32)[])' "$TUPLE" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
TX_CREATE=$(echo "$RAW" | jq -r '.transactionHash')
echo "  tx: $TX_CREATE"

LOGS=$(cast receipt "$TX_CREATE" --rpc-url "$RPC" --json)
BATCH_ID=$(echo "$LOGS" | jq -r --arg r "$REGISTRY" '.logs[] | select(.address|ascii_downcase == ($r|ascii_downcase)) | .topics[1]' | head -1)
echo "  batchId: $BATCH_ID"

# ─── Step 3: approve router for funding ───
echo "Step 3/4: approve(router, $FUNDED) [USDC]"
cast send "$USDC" 'approve(address,uint256)' "$ROUTER" "$FUNDED" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 \
    --json | jq -r '"  tx: \(.transactionHash)"'

# ─── Step 4: execute (FX corridor) ───
echo "Step 4/4: execute($BATCH_ID, $FUNDED, 50, \"\")"
EXEC_RAW=$(cast send "$ROUTER" 'execute(bytes32,uint256,uint16,bytes)' "$BATCH_ID" "$FUNDED" 50 "0x" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
TX_EXEC=$(echo "$EXEC_RAW" | jq -r '.transactionHash')
echo "  tx: $TX_EXEC"

# Look for BatchSettled emitted by the router.
SETTLED_TOPIC=$(cast receipt "$TX_EXEC" --rpc-url "$RPC" --json | \
    jq -r --arg rtr "$ROUTER" '.logs[] | select(.address|ascii_downcase == ($rtr|ascii_downcase)) | .topics[0]')
EXPECTED_TOPIC=$(cast keccak "BatchSettled(bytes32,uint256,uint256)")
if [[ "$SETTLED_TOPIC" != "$EXPECTED_TOPIC" ]]; then
    echo "FAIL: BatchSettled event not found"
    echo "  got:      $SETTLED_TOPIC"
    echo "  expected: $EXPECTED_TOPIC"
    exit 1
fi
echo "  ✓ BatchSettled fired"

# ─── Post-balance verification ───
D_USDC_AFTER=$(bal_usdc "$DEPLOYER")
D_EURC_AFTER=$(bal_eurc "$DEPLOYER")
G_USDC_AFTER=$(bal_usdc "$REGISTRY")
A_USDC_AFTER=$(bal_usdc "$ADAPTER")
A_EURC_AFTER=$(bal_eurc "$ADAPTER")
R_USDC_AFTER=$(bal_usdc "$ROUTER")
R_EURC_AFTER=$(bal_eurc "$ROUTER")

cat <<EOF

After USDC:  deployer=$D_USDC_AFTER  registry=$G_USDC_AFTER  router=$R_USDC_AFTER  adapter=$A_USDC_AFTER
After EURC:  deployer=$D_EURC_AFTER  router=$R_EURC_AFTER  adapter=$A_EURC_AFTER

EOF

D_USDC_DELTA=$((D_USDC_AFTER - D_USDC_BEFORE))
D_EURC_DELTA=$((D_EURC_AFTER - D_EURC_BEFORE))
G_USDC_DELTA=$((G_USDC_AFTER - G_USDC_BEFORE))
A_USDC_DELTA=$((A_USDC_AFTER - A_USDC_BEFORE))
A_EURC_DELTA=$((A_EURC_AFTER - A_EURC_BEFORE))
R_USDC_DELTA=$((R_USDC_AFTER - R_USDC_BEFORE))
R_EURC_DELTA=$((R_EURC_AFTER - R_EURC_BEFORE))

echo "Deltas:"
echo "  USDC: deployer=$D_USDC_DELTA  registry=$G_USDC_DELTA  router=$R_USDC_DELTA  adapter=$A_USDC_DELTA"
echo "  EURC: deployer=$D_EURC_DELTA  router=$R_EURC_DELTA  adapter=$A_EURC_DELTA"

# ─── Invariants ───
# Registry kept the fee.
[[ "$G_USDC_DELTA" -eq "$FEE" ]] || { echo "FAIL: registry USDC delta != $FEE"; exit 1; }
# Router holds nothing.
[[ "$R_USDC_DELTA" -eq 0 ]] || { echo "FAIL: router USDC delta != 0"; exit 1; }
[[ "$R_EURC_DELTA" -eq 0 ]] || { echo "FAIL: router EURC delta != 0"; exit 1; }
# Adapter received funded USDC, paid out the recipient amount in EURC.
[[ "$A_USDC_DELTA" -eq "$FUNDED" ]] || { echo "FAIL: adapter USDC delta != $FUNDED"; exit 1; }
[[ "$A_EURC_DELTA" -eq -"$AMOUNT" ]] || { echo "FAIL: adapter EURC delta != -$AMOUNT"; exit 1; }
# Deployer (= recipient) net EURC = +AMOUNT.
[[ "$D_EURC_DELTA" -eq "$AMOUNT" ]] || { echo "FAIL: deployer EURC delta != $AMOUNT"; exit 1; }
# Deployer USDC delta should be -fee - funded - gas.
EXPECTED_USDC_NEG=$((-FEE - FUNDED))
[[ "$D_USDC_DELTA" -lt "$EXPECTED_USDC_NEG" ]] && true || { echo "FAIL: deployer USDC delta should be < $EXPECTED_USDC_NEG (= -fee - funded), got $D_USDC_DELTA"; exit 1; }

cat <<EOF
--------------------------------------------------
ALL INVARIANTS HOLD:
  registry kept exactly $FEE (fee)
  router holds 0 USDC, 0 EURC (no retention)
  adapter swapped $FUNDED USDC for $AMOUNT EURC (atomic)
  deployer net change: +$AMOUNT EURC  /  -$((-D_USDC_DELTA)) USDC
==================================================
EOF
