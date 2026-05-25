// Auto-extracted from src/BatchRegistry.sol. Events only — Ponder doesn't
// need the full contract ABI.
export const BatchRegistryAbi = [
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
    {
        type: "event",
        name: "RouterSet",
        inputs: [{ name: "router", type: "address", indexed: true }],
        anonymous: false,
    },
    {
        type: "event",
        name: "RegistrationFeeSet",
        inputs: [
            { name: "oldFee", type: "uint256", indexed: false },
            { name: "newFee", type: "uint256", indexed: false },
        ],
        anonymous: false,
    },
    {
        type: "event",
        name: "StatusUpdated",
        inputs: [
            { name: "batchId", type: "bytes32", indexed: true },
            { name: "oldStatus", type: "uint8", indexed: false },
            { name: "newStatus", type: "uint8", indexed: false },
        ],
        anonymous: false,
    },
    // We also need the Recipient[] storage layout to read recipients per batch.
    // Provided as a function so Ponder.context.client.readContract works.
    {
        type: "function",
        name: "getRecipients",
        stateMutability: "view",
        inputs: [{ name: "batchId", type: "bytes32" }],
        outputs: [
            {
                type: "tuple[]",
                components: [
                    { name: "wallet", type: "address" },
                    { name: "amount", type: "uint256" },
                    { name: "outputCurrency", type: "bytes32" },
                ],
            },
        ],
    },
] as const;
