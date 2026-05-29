import type { Address, Hex } from "viem";

const env = (k: string, fallback: string): Address =>
    (process.env[k] ?? fallback) as Address;

export const ADDRESSES = {
    batchRegistry: env("NEXT_PUBLIC_BATCH_REGISTRY", "0x34705cF46Ddf9f3cE53f5492B6376678BE62F0fc"),
    batchRouter: env("NEXT_PUBLIC_BATCH_ROUTER", "0x6eD720FDF5c28cF8895A8049Fe13AF1384d82d20"),
    usdc: env("NEXT_PUBLIC_USDC_ADDRESS", "0x3600000000000000000000000000000000000000"),
    eurc: env("NEXT_PUBLIC_EURC_ADDRESS", "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"),
} as const;

/** ERC-20 minimal ABI for approve + balanceOf reads + decimals + symbol. */
export const erc20Abi = [
    {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
    },
    {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
    },
    {
        type: "function",
        name: "allowance",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
        ],
        outputs: [{ type: "uint256" }],
    },
    {
        type: "function",
        name: "decimals",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint8" }],
    },
    {
        type: "function",
        name: "symbol",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "string" }],
    },
] as const;

export const batchRegistryAbi = [
    {
        type: "function",
        name: "createBatch",
        stateMutability: "nonpayable",
        inputs: [
            {
                name: "rs",
                type: "tuple[]",
                components: [
                    { name: "wallet", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "outputCurrency", type: "bytes32" },
                ],
            },
        ],
        outputs: [{ type: "bytes32" }],
    },
    {
        type: "function",
        name: "registrationFee",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
    },
    {
        type: "event",
        name: "BatchCreated",
        inputs: [
            { name: "batchId", type: "bytes32", indexed: true },
            { name: "sender", type: "address", indexed: true },
            { name: "totalAmountSum", type: "uint256", indexed: false },
            { name: "recipientCount", type: "uint256", indexed: false },
        ],
        anonymous: false,
    },
] as const;

export const batchRouterAbi = [
    {
        type: "event",
        name: "BatchSettled",
        inputs: [
            { name: "batchId", type: "bytes32", indexed: true },
            { name: "totalDistributed", type: "uint256", indexed: false },
            { name: "recipientCount", type: "uint256", indexed: false },
        ],
        anonymous: false,
    },
] as const;

/** Bytes32-encoded ticker for the USDC corridor. */
export const USDC_TICKER: Hex = "0x5553444300000000000000000000000000000000000000000000000000000000";
/** Bytes32-encoded ticker for the EURC corridor. */
export const EURC_TICKER: Hex = "0x4555524300000000000000000000000000000000000000000000000000000000";

/** Convenient mapping for the dashboard's display lookups. */
export const tickerToInfo = (ticker: Hex): { symbol: string; decimals: number; address: Address } | null => {
    if (ticker.toLowerCase() === USDC_TICKER.toLowerCase()) {
        return { symbol: "USDC", decimals: 6, address: ADDRESSES.usdc };
    }
    if (ticker.toLowerCase() === EURC_TICKER.toLowerCase()) {
        return { symbol: "EURC", decimals: 6, address: ADDRESSES.eurc };
    }
    return null;
};
