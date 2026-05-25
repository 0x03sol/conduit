import { parseAbi, parseAbiItem } from "viem";

/**
 * MessageSent event emitted by MessageTransmitterV2 on the source chain
 * for every cross-chain message (including CCTP token burns + hooks).
 */
export const messageSentEvent = parseAbiItem("event MessageSent(bytes message)");

/**
 * Just the function we call on the destination chain's MessageTransmitterV2.
 * We don't need the full contract ABI.
 */
export const messageTransmitterReceiveAbi = parseAbi([
    "function receiveMessage(bytes message, bytes attestation) external returns (bool)",
    "event MessageReceived(address indexed caller, uint32 sourceDomain, uint64 indexed nonce, bytes32 sender, bytes messageBody)",
]);
