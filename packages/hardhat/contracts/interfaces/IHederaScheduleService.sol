// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The HIP-1215 call this template uses. The system contract is `0x16b`. It returns a response code and
/// never reverts; 22 is SUCCESS.
interface IHederaScheduleService {
    function scheduleCallWithPayer(
        address to,
        address payer,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress);
}
