/**
 * Conduit terminal command engine.
 *
 * Pure, synchronous, offline. `runCommand` maps a raw input line to an
 * array of output lines. Known commands do real things (print live
 * addresses, the flow diagram, a settlement walk-through); anything
 * unrecognized falls through to a deadpan sysadmin chat persona.
 *
 * No network, no eval, no side effects beyond the returned strings and
 * the special `__CLEAR__` sentinel the component watches for.
 */

export const CLEAR = "__CLEAR__";
export const ANIM_ARC = "__ANIM_ARC__";

/** Cat batting a USDC coin. Each frame is a fixed 4-line block so the
 *  component can swap frames in place without the layout jumping. */
export const ARC_FRAMES: string[][] = [
    [
        "      /\\_/\\",
        "     ( o.o )        ($)",
        "     (\")_(\")       USDC",
        "                       ",
    ],
    [
        "      /\\_/\\",
        "     ( o.o )      ($)  ",
        "     (\")_(\")     USDC ",
        "                       ",
    ],
    [
        "      /\\_/\\",
        "     ( -.o )=3  ($)    ",
        "     (\")_(\")    USDC  ",
        "        *bat*           ",
    ],
    [
        "      /\\_/\\",
        "     ( ^.^ )            ($) ~~>",
        "     (\")_(\")       USDC       ",
        "                               ",
    ],
];

export const ARC_CAPTION = [
    "the cat approves. so does the rail.",
    "Arc Network: USDC-native L1, sub-second finality, chain id 5042002.",
];

const CONTRACTS = [
    "BatchRegistry      0x34705cF46Ddf9f3cE53f5492B6376678BE62F0fc",
    "BatchRouter        0x6eD720FDF5c28cF8895A8049Fe13AF1384d82d20",
    "CCTPHookReceiver   0xAe225c9F39664Ff01D11dA9cD29452a2bE0E8FE3",
    "FxEscrowAdapter    0xB26eF145C041c3d2a1b31ccda8aCB88fe242ab3d",
];

const FLOW = [
    "  createBatch           BatchRegistry (Arc)",
    "      |",
    "  depositForBurnWithHook TokenMessengerV2 (source)",
    "      |   burns USDC, hookData = batchId",
    "  Iris attestation       ~24s",
    "      |",
    "  receiveMessage         MessageTransmitterV2 (Arc)  -> mints USDC",
    "      |",
    "  processCCTPMessage     CCTPHookReceiver -> BatchRouter.execute",
    "      |   optional USDC->EURC via FxEscrow",
    "  BatchSettled           every recipient paid, one tx",
];

const HELP = [
    "commands:",
    "  help        this list",
    "  whoami      who you are here",
    "  ls          list the home dir",
    "  contracts   live Phase 4 addresses on Arc testnet",
    "  flow        how one burn pays many recipients",
    "  settle      run a (simulated) settlement",
    "  arc         play with the cat (and what Arc is)",
    "  clear       wipe the screen",
    "",
    "tip: type 'flow' to see how one burn pays 50 vendors.",
    "or just talk to me. i'm listening.",
];

/** Deadpan replies for recognized chat patterns. Order matters. */
const CHAT: { test: RegExp; reply: string[] }[] = [
    { test: /^(hi|hey|hello|yo|sup|wassup|wagmi)\b/i, reply: ["hey. node's up, USDC's flowing. what do you need? (try 'help')"] },
    { test: /\b(are you (an )?ai|are you a bot|chatgpt|llm)\b/i, reply: ["i'm a shell script with commitment issues. type 'help'."] },
    { test: /\b(is this real|real product|legit|does (this|it) work)\b/i, reply: ["realer than your last bridge transaction. type 'flow'."] },
    { test: /\b(moon|lambo|pump|price|token|airdrop)\b/i, reply: ["we don't do moon. we do 'settled in ~24 seconds.' type 'settle'."] },
    { test: /\b(scam|rug|ponzi)\b/i, reply: ["one USDC burn, one atomic payout, every address on-chain. read 'contracts'. then apologize."] },
    { test: /\bi love you\b/i, reply: ["this is a B2B settlement terminal, not a dating app. but noted."] },
    { test: /\b(thanks|thank you|ty|cheers)\b/i, reply: ["anytime. the rail never sleeps."] },
    { test: /\b(who (made|built) you|who are you|your name)\b/i, reply: ["i run the Conduit settlement node on Arc. i don't get a name. i get uptime."] },
    { test: /\b(help me|how do i|how to)\b/i, reply: ["start with 'flow', then 'contracts'. open Batch Builder to actually move money."] },
    { test: /\bgm\b/i, reply: ["gm. blocks are landing sub-second. good day to settle."] },
    { test: /\b(bye|exit|quit|logout)\b/i, reply: ["there is no exit. only settlement."] },
];

/** Random deadpan fallbacks for anything else. */
const FALLBACK = [
    "i only speak settlement. type 'help'.",
    "command not found. but i respect the confidence.",
    "i'm a terminal, not a therapist. type 'help'.",
    "didn't parse that. 'flow' is more interesting anyway.",
    "hmm. no. try 'help'.",
];

let fallbackIdx = 0;

export function runCommand(raw: string, prompt: string): string[] {
    const line = raw.trim();
    const echo = `${prompt} ${raw}`;
    if (line === "") return [echo];

    const cmd = line.toLowerCase();
    const out = (lines: string[]) => [echo, ...lines];

    // ── working commands ──
    if (cmd === "help" || cmd === "?") return out(HELP);
    if (cmd === "whoami") return out(["guest@conduit. read access to a live settlement node. mind the USDC."]);
    if (cmd === "ls" || cmd === "ls -la") return out(["README.txt   contracts/   batches/   flow.txt   .secrets (permission denied)"]);
    if (cmd === "contracts") return out(["Arc testnet (chain 5042002):", ...CONTRACTS]);
    if (cmd === "flow") return out(FLOW);
    if (cmd === "arc") return out([ANIM_ARC]);
    if (cmd === "clear" || cmd === "cls") return [CLEAR];
    if (cmd === "settle") {
        return out([
            "simulating settlement...",
            "  [1/5] createBatch            ok  (batchId 0x9f3c…a21)",
            "  [2/5] depositForBurnWithHook ok  (Sepolia, 150 USDC burned)",
            "  [3/5] iris attestation       ok  (24s, 3 polls)",
            "  [4/5] receiveMessage         ok  (USDC minted on Arc)",
            "  [5/5] BatchSettled           ok  (50 recipients paid, 1 tx)",
            "done. that's the whole pitch.",
        ]);
    }
    if (cmd === "cat readme.txt" || cmd === "cat readme") return out(["already printed above. scroll up, or type 'flow'."]);

    // ── easter eggs ──
    if (cmd.startsWith("sudo")) return out(["nice try. you're not in the sudoers file. this incident will be reported."]);
    if (cmd === "rm -rf /" || cmd === "rm -rf /*") return out(["permission denied. and rude."]);
    if (cmd === "vim" || cmd === "vi" || cmd === "nano") return out(["you're trapped forever. (kidding) [editor closed]"]);
    if (cmd === "42") return out(["the answer to settlement, the universe, and everything."]);
    if (cmd === "hello world") return out(["   /\\", "  /  \\   Arc", " /----\\"]);
    if (cmd === "matrix") return out(["0x3f USDC 0xa7 0x4f EURC 0xfc 0x88 USDC 0x21 0x9e burn mint settle …"]);
    if (cmd.startsWith("echo ")) return out([raw.slice(raw.indexOf("echo ") + 5)]);
    if (cmd === "ping") return out(["pong. ~0.4s. that's also our settlement time, roughly."]);

    // ── chat persona ──
    for (const c of CHAT) if (c.test.test(line)) return out(c.reply);

    const fb = FALLBACK[fallbackIdx % FALLBACK.length]!;
    fallbackIdx++;
    return out([fb]);
}
