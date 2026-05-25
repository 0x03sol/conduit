"use client";

const README = `Conduit — README.txt

================================================================
  CONDUIT: ATOMIC CROSS-CHAIN B2B SETTLEMENT ON ARC NETWORK
================================================================

WHAT IT DOES
------------
One USDC burn on any CCTP-supported source chain (e.g. Sepolia)
settles atomically as multi-recipient payments in regional
stablecoins (USDC / EURC) on Arc Network — in under one second.

HOW IT WORKS
------------
  1. Sender uploads CSV: wallet, amount, currency
  2. BatchRegistry on Arc records the batch + recipient list
  3. Sender burns USDC on source chain via CCTP V2
     depositForBurnWithHook  (hookData = batchId)
  4. Circle Iris attestation (~24 sec)
  5. MessageTransmitterV2 mints USDC on Arc + invokes
     CCTPHookReceiver.processCCTPMessage(message)
  6. Hook -> BatchRouter.execute(batchId)
     -> FX corridor swap if needed (USDC -> EURC etc)
     -> distributes to all recipients in one tx
     -> emits BatchSettled

LIVE DEPLOYMENT (Arc Testnet, chain 5042002)
--------------------------------------------
  BatchRegistry        0x823b34D7FBa61628cE3e665F86f715e823657A17
  BatchRouter          0x1a8F8B0aA5fe50c3c9B48E5aCA56aBe2CE52452f
  CCTPHookReceiver     0xe495183df2035aB5882bC2957ec0f94B2F03e22b

PROVEN FLOW
-----------
  Sepolia burn   0xa70f0cef...4f40253
  Iris attest    24 sec (3 polls)
  Arc mint       0x4f1ea229...0c84ba
  Hook dispatch  0xfc746072...442e2  (BatchSettled fired)

STACK
-----
  Solidity 0.8.26  ·  Foundry  ·  148 tests, 100% coverage
  Next.js 14       ·  wagmi v2  ·  viem 2  ·  Privy
  Ponder indexer   ·  sqlite + drizzle
  Iris relayer     ·  21 vitest cases

ATTRIBUTIONS
------------
  Win7 chrome:  7.css (MIT) by khang-nd
  Icons:        icons8 (officel set, used per icons8 TOS)
  Sounds:       Web Audio synthesized in-browser

ARC BUILDERS FUND
-----------------
This is a testnet submission for the Arc Builders Fund.
Mainnet readiness pending Circle Paymaster availability on Arc
(currently undeployed -> Q-006 in memory.md).

================================================================
                          END OF FILE
================================================================
`;

export function ReadmeApp() {
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
                value={README}
                style={{
                    flex: 1,
                    fontFamily: "Consolas, 'Lucida Console', 'Courier New', monospace",
                    fontSize: "13px",
                    margin: 0,
                    padding: "8px",
                    resize: "none",
                    background: "#fff",
                    color: "#000",
                    border: "none",
                    outline: "none",
                    whiteSpace: "pre",
                }}
            />
        </div>
    );
}
