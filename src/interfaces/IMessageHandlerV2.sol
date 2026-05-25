// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IMessageHandlerV2
/// @notice Recipient-side interface for Circle's CCTP V2 message hooks.
///         When `MessageTransmitterV2.receiveMessage` is invoked, the
///         transmitter mints any associated USDC to `mintRecipient` (this
///         contract) FIRST, then calls one of the two methods below
///         depending on the message's `finalityThresholdExecuted`:
///
///           * `finalityThresholdExecuted >= 2000` → `handleReceiveFinalizedMessage`
///           * `finalityThresholdExecuted <  2000` → `handleReceiveUnfinalizedMessage`
///
///         Source: `developers.circle.com/cctp/references/technical-guide`
///                 (verified 2026-05-25).
///
/// @dev    Implementations MUST gate by `msg.sender == messageTransmitter`
///         and SHOULD additionally allowlist `(sourceDomain, sender)` pairs.
///         Both methods MUST return `true` on success.
interface IMessageHandlerV2 {
    function handleReceiveFinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        uint32 finalityThresholdExecuted,
        bytes calldata messageBody
    ) external returns (bool);

    function handleReceiveUnfinalizedMessage(
        uint32 sourceDomain,
        bytes32 sender,
        uint32 finalityThresholdExecuted,
        bytes calldata messageBody
    ) external returns (bool);
}
