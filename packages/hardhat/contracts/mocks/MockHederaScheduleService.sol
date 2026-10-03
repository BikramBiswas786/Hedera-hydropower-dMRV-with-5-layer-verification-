// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Stand-in for the Schedule Service at `0x16b` on a local chain, where the precompile does not exist.
/// Records the call `schedulePurchase` asks Hedera to make. It does not execute it: the demo and the tests fire
/// those bytes as the payer, which is the call Hedera makes after the payer signs.
contract MockHederaScheduleService {
    struct Call {
        address to;
        address payer;
        uint256 expiry;
        uint256 gasLimit;
        uint64 value;
        bytes data;
    }

    Call[] private _calls;

    function scheduleCallWithPayer(
        address to,
        address payer,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes memory callData
    ) external returns (int64 responseCode, address scheduleAddress) {
        _calls.push(Call(to, payer, expirySecond, gasLimit, value, callData));
        return (22, address(uint160(0x5CED0000 + _calls.length)));
    }

    function callCount() external view returns (uint256) {
        return _calls.length;
    }

    function scheduledPayer(uint256 index) external view returns (address) {
        return _calls[index].payer;
    }

    function scheduledData(uint256 index) external view returns (bytes memory) {
        return _calls[index].data;
    }

    function scheduledExpiry(uint256 index) external view returns (uint256) {
        return _calls[index].expiry;
    }
}
