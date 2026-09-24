// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";

/// @notice Settable Chainlink feed for local chains and tests.
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public immutable override decimals;

    uint80 private _roundId;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        updateAnswer(initialAnswer);
    }

    function description() external pure override returns (string memory) {
        return "HBAR / USD (mock)";
    }

    function updateAnswer(int256 answer) public {
        _roundId++;
        _answer = answer;
        _updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 updatedAt) external {
        _updatedAt = updatedAt;
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}
