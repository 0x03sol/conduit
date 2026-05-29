"use client";

const ROADMAP = `Conduit  Roadmap

v1 (shipped, Arc testnet)
=========================
  4 contracts live, 157 forge tests passing.
  Cross-chain proof: Sepolia burn -> Iris attest -> Arc mint ->
  BatchSettled fired.

  BatchRegistry        0x34705cF46Ddf9f3cE53f5492B6376678BE62F0fc
  BatchRouter          0x6eD720FDF5c28cF8895A8049Fe13AF1384d82d20
  CCTPHookReceiver     0xAe225c9F39664Ff01D11dA9cD29452a2bE0E8FE3
  FxEscrowAdapter      0xB26eF145C041c3d2a1b31ccda8aCB88fe242ab3d


v1 audit fixes (in this build)
==============================
  H-1   processHook gated by a dispatcher allowlist
  M-1   maxSlippageBps documented as reserved
  M-2   Residual event for operator monitoring
  M-3   dead handler methods annotated
  L-2   withdrawFees on BatchRegistry
  L-4   MAX_REGISTRATION_FEE cap (1000 USDC)


v2 (planned)
============
  Contracts
    Ownable2Step on all admin contracts
    Pausable on createBatch / execute / hook entry points
    Bind each dispatch to its source (srcDomain, messageSender)
    Read burn amount from BurnMessageV2 instead of balanceOf

  FX
    Allowlist a real Circle market maker (v1 uses the deployer)
    BRLA corridor once Avenia testnet tokens land

  Off-chain
    Relayer calls processHook automatically after the mint
    Relayer hot wallet moves to KMS / HSM
    Indexer runs under pm2 with auto-restart
    Dashboard auth moves behind an AuthBoundary component

  Mainnet
    Circle Paymaster once it supports Arc (gasless UX)


Full detail: ROADMAP.md in the repo.
`;

export function RoadmapApp() {
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
                value={ROADMAP}
                aria-label="Conduit roadmap — read-only document"
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
