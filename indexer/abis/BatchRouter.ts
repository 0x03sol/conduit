// Auto-extracted from src/BatchRouter.sol. Events only.
export const BatchRouterAbi = [
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
