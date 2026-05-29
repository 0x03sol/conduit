"use client";

const HOW_IT_WORKS = `conduit/dashboard  How It Works

A settlement is one batch:
  one sender,
  N recipients,
  one source-chain USDC burn,
  one atomic distribution on Arc.


REQUIRES
  source-chain wallet with USDC and native gas
  Arc testnet in wallet  (chainId 5042002)
  NEXT_PUBLIC_PRIVY_APP_ID in dashboard/.env.local


A. SIGN IN
   Click the start orb, choose "Sign in".
   Privy modal: email, social, wallet.
   Email and social paths create an embedded wallet.
   Wallet path supports MetaMask, Rabby, Coinbase, WalletConnect.

B. OPEN BATCH BUILDER
   Double-click "Batch Builder" on the desktop.
   Component: src/win7/apps/SenderApp.tsx

C. UPLOAD CSV
   Three columns: wallet, amount, currency.
   Currency: "USDC" or "EURC" (case-insensitive).
   Parser rejects:
     duplicate wallets
     amounts <= 0 or non-finite
     unsupported currency strings
     addresses that are not 0x + 40 hex chars
   Code: src/lib/csv.ts

D. REVIEW
   The dashboard shows each row: wallet, amount, currency, status.
   The total in USDC equivalent appears once all rows parse.

E. SIGN PERMIT2
   EIP-712 PermitTransferFrom on the source-chain USDC.
   Spender = BatchRouter on Arc.
   Code: src/lib/permit2.ts

F. CREATE BATCH ON ARC
   call BatchRegistry.createBatch(recipients[], amounts[], currencies[])
   returns batchId (bytes32)
   Tx fee: Arc testnet USDC.
   (Mainnet path: Circle Paymaster, after Arc deployment.)

G. BURN ON SOURCE CHAIN
   call TokenMessengerV2.depositForBurnWithHook(
          amount,
          ARC_CCTP_DOMAIN,
          mintRecipient     = BatchRouter,
          burnToken         = USDC_SOURCE,
          destinationCaller = CCTPHookReceiver,
          hookData          = abi.encode(batchId)
        )
   emits DepositForBurn

H. IRIS POLLS
   GET https://iris-api-sandbox.circle.com/v2/messages/{nonce}
   The relayer polls every 4s.
   Sepolia attestation: ~24s, 3 polls.

I. RECEIVE ON ARC
   call MessageTransmitterV2.receiveMessage(message, attestation)
   MessageTransmitterV2 mints USDC into BatchRouter and calls
   CCTPHookReceiver.processCCTPMessage(message).
   Relayer code: relayer/src/receiver.ts

J. HOOK DISPATCH
   CCTPHookReceiver decodes batchId from hookData
   and calls BatchRouter.execute(batchId).

K. FX CORRIDOR  (only if any recipient currency != USDC)
   BatchRouter calls FxEscrow.fillRfq(quote, sig).
   The quote is an off-chain EIP-712 signature from a market maker.
   fillRfq swaps the USDC chunk for the target stablecoin at the
   locked rate. No oracle.

L. DISTRIBUTE
   for each recipient i:
     ERC20(currencies[i]).transfer(recipients[i], amounts[i])
   All transfers run in one tx. A revert rolls back the whole batch.

M. SETTLE
   BatchRouter emits BatchSettled(
     batchId,
     recipientCount,
     totalAmountUsdc,
     settledAt
   )

N. INDEX
   Ponder watches BatchSettled (and other events).
   Schema: indexer/ponder.schema.ts
   Settlement Monitor (OperatorApp) reads from ponder.

O. RECIPIENT VIEW
   Inbox app calls fetchRecipientPayments(address).
   The list filters by recipient = connected address.


MANUAL INSPECTION
   cast call $BATCH_REGISTRY 'getBatch(bytes32)' $BATCH_ID \\
        --rpc-url $ARC_RPC
   cast logs --address $BATCH_ROUTER --rpc-url $ARC_RPC


DEBUGGING
   iris message stuck     check source-chain finality and tx receipt
   hook didn't fire       check destinationCaller and hookData
   recipient missing      check ERC20.balanceOf in tx traces
   permit reverted        check sig domain matches PermitTransferFrom


ENV  (dashboard/.env.local)
   NEXT_PUBLIC_PRIVY_APP_ID
   NEXT_PUBLIC_ARC_RPC_URL
   NEXT_PUBLIC_PONDER_URL
   NEXT_PUBLIC_BATCH_REGISTRY
   NEXT_PUBLIC_BATCH_ROUTER
   NEXT_PUBLIC_CCTP_HOOK_RECEIVER


REPO
   contracts/   Solidity, Foundry
   dashboard/   this app
   indexer/     ponder
   relayer/     iris poller + receiver
`;

export function NotepadApp() {
    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <ul role="menubar" className="can-hover" style={{ borderRadius: 0 }}>
                <li role="menuitem" tabIndex={0}>File</li>
                <li role="menuitem" tabIndex={0}>Edit</li>
                <li role="menuitem" tabIndex={0}>Format</li>
                <li role="menuitem" tabIndex={0}>View</li>
                <li role="menuitem" tabIndex={0}>Help</li>
            </ul>
            <textarea
                readOnly
                value={HOW_IT_WORKS}
                aria-label="How It Works walkthrough — read-only document"
                style={{
                    flex: 1,
                    fontFamily: 'Consolas, "Lucida Console", "Courier New", monospace',
                    fontSize: "13px",
                    margin: 0,
                    padding: "8px 10px",
                    resize: "none",
                    background: "#fff",
                    color: "#000",
                    border: "none",
                    outline: "none",
                    whiteSpace: "pre",
                    lineHeight: 1.4,
                }}
            />
        </div>
    );
}
