#!/usr/bin/env bash
# script/live-cctp-test.sh
#
# Phase 3.2.3 LIVE integration test: real CCTP V2 burn on Sepolia, real Iris
# attestation, real settlement on Arc testnet, real transaction hashes.
#
# Lifecycle:
#   1. Pre-create a batch on Phase 2.3 BatchRegistry (Arc)
#   2. Approve USDC on Sepolia for TokenMessengerV2
#   3. depositForBurnWithHook on Sepolia (Fast Transfer, finality=1000)
#   4. Poll Iris until status=complete
#   5. MessageTransmitterV2.receiveMessage on Arc (mints USDC to receiver)
#   6. CCTPHookReceiver.processBurnMessage(message) → dispatches batch
#   7. Verify recipient got USDC + BatchSettled fired
#
# Usage:
#   set -a; source .env; set +a
#   bash script/live-cctp-test.sh

set -euo pipefail
: "${DEPLOYER_PK:?source .env first}"
: "${SEPOLIA_RPC_URL:?SEPOLIA_RPC_URL required}"

# ─── Constants ────────────────────────────────────────────────────────────────
SEPOLIA_RPC=$SEPOLIA_RPC_URL
ARC_RPC=arc_testnet
SEPOLIA_DOMAIN=0
ARC_DOMAIN=26
SEPOLIA_USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
SEPOLIA_TOKEN_MESSENGER=0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA
ARC_USDC=0x3600000000000000000000000000000000000000
ARC_MESSAGE_TRANSMITTER=0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275
ARC_REGISTRY=0x823b34D7FBa61628cE3e665F86f715e823657A17        # Phase 2.3
ARC_ROUTER=0x1a8F8B0aA5fe50c3c9B48E5aCA56aBe2CE52452f          # Phase 2.3 FX-enabled
RECEIVER=0xe495183df2035aB5882bC2957ec0f94B2F03e22b            # Phase 3.2.3
IRIS_BASE=https://iris-api-sandbox.circle.com
USDC_TICKER="0x5553444300000000000000000000000000000000000000000000000000000000"

DEPLOYER=$(cast wallet address "$DEPLOYER_PK")
# Pad address to 32 bytes (12 leading zero bytes + 20-byte address).
RECEIVER_PADDED="0x000000000000000000000000${RECEIVER:2}"

# Tunable parameters.
BURN_AMOUNT=${BURN_AMOUNT:-1500000}     # 1.5 USDC burned on Sepolia
RECIPIENT_AMOUNT=${RECIPIENT_AMOUNT:-1000000}  # 1 USDC payout on Arc
MAX_FEE=${MAX_FEE:-100000}              # 0.1 USDC fee cap (over-pays; Iris uses less)
MIN_FINALITY=${MIN_FINALITY:-1000}      # 1000 = Fast Transfer (confirmed)
SLIPPAGE_BPS=50

# ─── Header ──────────────────────────────────────────────────────────────────
cat <<EOF
======================================================
Phase 3.2.3 LIVE CCTP integration test
======================================================
  Deployer:    $DEPLOYER
  Sepolia USDC tx burns: $BURN_AMOUNT base units (1.5 USDC)
  Recipient gets:        $RECIPIENT_AMOUNT (1 USDC) on Arc
  Max fee:               $MAX_FEE (0.1 USDC over-pay cap)
  minFinalityThreshold:  $MIN_FINALITY (Fast Transfer)
  Sepolia → Arc domain: $SEPOLIA_DOMAIN → $ARC_DOMAIN
  Receiver on Arc:       $RECEIVER
  Registry/Router on Arc: $ARC_REGISTRY / $ARC_ROUTER
------------------------------------------------------
EOF

# Helper: cast send with a small post-confirm sleep so the next tx sees the
# updated nonce. Arc's sub-second finality can outpace the RPC pending-nonce
# view between back-to-back broadcasts.
send_arc() {
    local out
    out=$(cast send "$@" --private-key "$DEPLOYER_PK" --rpc-url "$ARC_RPC" --confirmations 1 --json)
    sleep 2
    echo "$out"
}
send_sep() {
    local out
    out=$(cast send "$@" --private-key "$DEPLOYER_PK" --rpc-url "$SEPOLIA_RPC" --confirmations 1 --json)
    sleep 2
    echo "$out"
}

bal_sep_usdc() { cast call $SEPOLIA_USDC 'balanceOf(address)(uint256)' $1 --rpc-url $SEPOLIA_RPC | awk '{print $1}'; }
bal_arc_usdc() { cast call $ARC_USDC 'balanceOf(address)(uint256)' $1 --rpc-url $ARC_RPC | awk '{print $1}'; }

# Initial balances.
DEP_SEP_BEFORE=$(bal_sep_usdc $DEPLOYER)
DEP_ARC_BEFORE=$(bal_arc_usdc $DEPLOYER)
RECEIVER_ARC_BEFORE=$(bal_arc_usdc $RECEIVER)
echo "Pre: deployer Sepolia USDC = $DEP_SEP_BEFORE"
echo "Pre: deployer Arc USDC     = $DEP_ARC_BEFORE"
echo "Pre: receiver Arc USDC     = $RECEIVER_ARC_BEFORE"

# ─── Step 1: pre-create batch on Arc registry ────────────────────────────────
echo ""
echo "=== Step 1/6: pre-create batch (deployer → self, 1 USDC, USDC corridor) ==="
if [[ -n "${BATCH_ID:-}" ]]; then
    echo "  BATCH_ID provided via env — skipping createBatch."
    echo "  Reusing batchId: $BATCH_ID"
else
    # Approve registry for the 1 USDC fee.
    send_arc $ARC_USDC 'approve(address,uint256)' $ARC_REGISTRY 1000000 \
        | jq -r '"  approve registry tx: \(.transactionHash)"'

    BATCH_TUPLE="[($DEPLOYER,$RECIPIENT_AMOUNT,$USDC_TICKER)]"
    CB_RAW=$(send_arc $ARC_REGISTRY 'createBatch((address,uint256,bytes32)[])' "$BATCH_TUPLE")
    CB_TX=$(echo $CB_RAW | jq -r '.transactionHash')
    BATCH_ID=$(cast receipt $CB_TX --rpc-url $ARC_RPC --json | \
        jq -r --arg r "$ARC_REGISTRY" '.logs[] | select(.address|ascii_downcase == ($r|ascii_downcase)) | .topics[1]' | head -1)
    echo "  createBatch tx: $CB_TX"
    echo "  batchId:        $BATCH_ID"
fi

# ─── Step 2: build hookData ──────────────────────────────────────────────────
HOOK_DATA=$(cast abi-encode 'f(bytes32,uint16,bytes)' $BATCH_ID $SLIPPAGE_BPS 0x)
echo ""
echo "=== Step 2/6: hookData encoded ==="
echo "  ${HOOK_DATA:0:96}..."

# ─── Step 3: approve + depositForBurnWithHook on Sepolia ─────────────────────
echo ""
echo "=== Step 3/6: depositForBurnWithHook on Sepolia ==="
send_sep $SEPOLIA_USDC 'approve(address,uint256)' $SEPOLIA_TOKEN_MESSENGER $BURN_AMOUNT \
    | jq -r '"  approve TokenMessengerV2 tx: \(.transactionHash)"'

BURN_RAW=$(send_sep $SEPOLIA_TOKEN_MESSENGER \
    'depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes)' \
    $BURN_AMOUNT $ARC_DOMAIN $RECEIVER_PADDED $SEPOLIA_USDC \
    0x0000000000000000000000000000000000000000000000000000000000000000 \
    $MAX_FEE $MIN_FINALITY $HOOK_DATA)
BURN_TX=$(echo $BURN_RAW | jq -r '.transactionHash')
BURN_BLOCK=$(echo $BURN_RAW | jq -r '.blockNumber')
echo "  burn tx:    $BURN_TX"
echo "  burn block: $BURN_BLOCK"
echo "  https://sepolia.etherscan.io/tx/$BURN_TX"

# ─── Step 4: poll Iris until attestation is complete ─────────────────────────
echo ""
echo "=== Step 4/6: poll Iris for attestation (Fast tier, expected 1-3 min) ==="
ATTESTATION=""
MESSAGE=""
DEADLINE=$(($(date +%s) + 600))   # 10-minute timeout
ATTEMPT=0
while (( $(date +%s) < DEADLINE )); do
    ATTEMPT=$((ATTEMPT + 1))
    RES=$(curl -sS "$IRIS_BASE/v2/messages/$SEPOLIA_DOMAIN?transactionHash=$BURN_TX" || echo '{"messages":[]}')
    STATUS=$(echo "$RES" | jq -r '.messages[0].status // "missing"')
    echo "  [$ATTEMPT] iris status=$STATUS"
    if [[ "$STATUS" == "complete" ]]; then
        ATTESTATION=$(echo "$RES" | jq -r '.messages[0].attestation')
        MESSAGE=$(echo "$RES" | jq -r '.messages[0].message')
        echo "  ✓ Iris attestation ready"
        echo "  message length: $(echo -n $MESSAGE | wc -c) hex chars"
        echo "  attest length:  $(echo -n $ATTESTATION | wc -c) hex chars"
        break
    fi
    sleep 8
done

if [[ -z "$ATTESTATION" ]]; then
    echo "FAIL: timed out waiting for Iris attestation"
    exit 1
fi

# ─── Step 5: receiveMessage on Arc → mints USDC to receiver ──────────────────
echo ""
echo "=== Step 5/6: MessageTransmitterV2.receiveMessage on Arc (mints USDC to receiver) ==="
RM_RAW=$(send_arc $ARC_MESSAGE_TRANSMITTER 'receiveMessage(bytes,bytes)' "$MESSAGE" "$ATTESTATION")
RM_TX=$(echo $RM_RAW | jq -r '.transactionHash')
RM_BLOCK=$(echo $RM_RAW | jq -r '.blockNumber')
echo "  receiveMessage tx: $RM_TX"
echo "  block: $RM_BLOCK"

RECEIVER_ARC_AFTER_MINT=$(bal_arc_usdc $RECEIVER)
MINTED=$((RECEIVER_ARC_AFTER_MINT - RECEIVER_ARC_BEFORE))
echo "  USDC minted to receiver: $MINTED"

# ─── Step 6: processCCTPMessage → dispatches batch ───────────────────────────
echo ""
echo "=== Step 6/6: receiver.processCCTPMessage(message) — dispatches the hook ==="
PH_RAW=$(send_arc $RECEIVER 'processCCTPMessage(bytes)' "$MESSAGE")
PH_TX=$(echo $PH_RAW | jq -r '.transactionHash')
echo "  processBurnMessage tx: $PH_TX"

# Verify BatchSettled fired.
SETTLED=$(cast receipt $PH_TX --rpc-url $ARC_RPC --json | \
    jq -r --arg r "$ARC_ROUTER" '.logs[] | select(.address|ascii_downcase == ($r|ascii_downcase)) | .topics[0]' | head -1)
EXPECTED=$(cast keccak "BatchSettled(bytes32,uint256,uint256)")
if [[ "$SETTLED" == "$EXPECTED" ]]; then
    echo "  ✓ BatchSettled event fired"
else
    echo "  ⚠ no BatchSettled topic (got: $SETTLED)"
fi

# ─── Final balances + summary ────────────────────────────────────────────────
DEP_SEP_AFTER=$(bal_sep_usdc $DEPLOYER)
DEP_ARC_AFTER=$(bal_arc_usdc $DEPLOYER)
RECEIVER_ARC_AFTER=$(bal_arc_usdc $RECEIVER)

cat <<EOF

======================================================
LIVE CCTP integration — RESULT
======================================================
Sepolia:
  burn tx:                 https://sepolia.etherscan.io/tx/$BURN_TX
  deployer USDC delta:     $((DEP_SEP_AFTER - DEP_SEP_BEFORE)) base units
Arc:
  receiveMessage tx:       https://testnet.arcscan.app/tx/$RM_TX
  processBurnMessage tx:   https://testnet.arcscan.app/tx/$PH_TX
  receiver USDC delta:     $((RECEIVER_ARC_AFTER - RECEIVER_ARC_BEFORE))   (residual after dispatch)
  deployer Arc USDC delta: $((DEP_ARC_AFTER - DEP_ARC_BEFORE))   (= recipient + gas)
batchId: $BATCH_ID
======================================================
EOF
