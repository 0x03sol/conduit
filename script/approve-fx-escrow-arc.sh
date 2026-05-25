#!/usr/bin/env bash
# script/approve-fx-escrow-arc.sh
#
# The deployer wallet (acting as the maker per D-008) approves MockFxEscrow
# to pull EURC during fillQuote. This is a one-time setup; afterward the
# escrow can settle any number of quotes against the maker's EURC balance.
#
# Usage:
#   set -a; source .env; set +a
#   bash script/approve-fx-escrow-arc.sh

set -euo pipefail
: "${DEPLOYER_PK:?DEPLOYER_PK is required (source .env first)}"

ART="deployments/arc-testnet-fx-escrow.json"
[[ -f $ART ]] || { echo "FAIL: $ART not found"; exit 1; }

ESCROW=$(jq -r '.contracts.MockFxEscrow' "$ART")
EURC=$(jq -r '.fx.token' "$ART")
MAKER=$(cast wallet address "$DEPLOYER_PK")
RPC=arc_testnet
# Unlimited allowance — testnet only. Use a tighter cap in production.
AMOUNT=$(cast --max-uint)

echo "Maker $MAKER → approve($ESCROW, max) [EURC=$EURC]"
RAW=$(cast send "$EURC" 'approve(address,uint256)' "$ESCROW" "$AMOUNT" \
    --private-key "$DEPLOYER_PK" --rpc-url "$RPC" --confirmations 1 --json)
echo "  tx: $(echo "$RAW" | jq -r '.transactionHash')"

ALLOWANCE=$(cast call "$EURC" 'allowance(address,address)(uint256)' "$MAKER" "$ESCROW" --rpc-url "$RPC" | awk '{print $1}')
echo "  allowance(maker, escrow) = $ALLOWANCE"

if [[ "$ALLOWANCE" == "0" ]]; then
    echo "FAIL: allowance still 0"
    exit 1
fi
echo "✓ Maker approved escrow for EURC."
