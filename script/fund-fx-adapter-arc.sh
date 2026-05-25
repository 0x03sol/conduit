#!/usr/bin/env bash
# script/fund-fx-adapter-arc.sh
#
# Transfers EURC from the deployer wallet (the "maker-side reserve") to the
# MockFxAdapter so it can deliver EURC on swap calls. Per GO-009, this lives
# outside the deploy script because forge-script can't simulate Arc's
# blocklist precompile during ERC-20 transfers.
#
# Usage:
#   set -a; source .env; set +a
#   bash script/fund-fx-adapter-arc.sh
#
# Optional env override:
#   FUND_AMOUNT  EURC base units to transfer (default 5_000_000 = 5 EURC)

set -euo pipefail

: "${DEPLOYER_PK:?DEPLOYER_PK is required (source .env first)}"

ART="deployments/arc-testnet-fx.json"
[[ -f $ART ]] || { echo "FAIL: $ART not found — run DeployArcFX.s.sol first"; exit 1; }

ADAPTER=$(jq -r '.contracts.MockFxAdapter' "$ART")
EURC=$(jq -r '.fx.token' "$ART")
AMOUNT="${FUND_AMOUNT:-5000000}"   # 5 EURC default
DEPLOYER=$(cast wallet address "$DEPLOYER_PK")
RPC=arc_testnet

bal() { cast call "$EURC" 'balanceOf(address)(uint256)' "$1" --rpc-url "$RPC" | awk '{print $1}'; }

cat <<EOF
==================================================
Fund MockFxAdapter with EURC reserves
==================================================
  Adapter:    $ADAPTER
  EURC:       $EURC
  Deployer:   $DEPLOYER
  Amount:     $AMOUNT base units ($((AMOUNT / 1000000)).$((AMOUNT % 1000000)) EURC)
--------------------------------------------------
EOF

DEPLOYER_BEFORE=$(bal "$DEPLOYER")
ADAPTER_BEFORE=$(bal "$ADAPTER")
echo "Before:  deployer=$DEPLOYER_BEFORE  adapter=$ADAPTER_BEFORE"

if [[ "$DEPLOYER_BEFORE" -lt "$AMOUNT" ]]; then
    echo "FAIL: deployer EURC balance ($DEPLOYER_BEFORE) is less than amount ($AMOUNT)"
    exit 1
fi

echo ""
echo "Transferring $AMOUNT EURC base units to adapter..."
TX_RAW=$(cast send "$EURC" 'transfer(address,uint256)' "$ADAPTER" "$AMOUNT" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
TX_HASH=$(echo "$TX_RAW" | jq -r '.transactionHash')
BLOCK=$(echo "$TX_RAW" | jq -r '.blockNumber')
echo "  tx: $TX_HASH  block: $BLOCK"

DEPLOYER_AFTER=$(bal "$DEPLOYER")
ADAPTER_AFTER=$(bal "$ADAPTER")
echo ""
echo "After:   deployer=$DEPLOYER_AFTER  adapter=$ADAPTER_AFTER"

D_DELTA=$((DEPLOYER_AFTER - DEPLOYER_BEFORE))
A_DELTA=$((ADAPTER_AFTER - ADAPTER_BEFORE))

if [[ "$A_DELTA" -ne "$AMOUNT" ]]; then
    echo "FAIL: adapter delta expected $AMOUNT, got $A_DELTA"
    exit 1
fi

cat <<EOF
--------------------------------------------------
✓ Adapter funded with $AMOUNT EURC base units.
  deployer change: $D_DELTA (= -$AMOUNT)
  adapter change:  $A_DELTA (= +$AMOUNT)
==================================================
EOF
