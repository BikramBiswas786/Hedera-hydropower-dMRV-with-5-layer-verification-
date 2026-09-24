// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISupraSValueFeed } from "../interfaces/ISupraSValueFeed.sol";

/// @notice Settable Supra push oracle for local chains and tests.
contract MockSupraSValueFeed is ISupraSValueFeed {
    mapping(uint256 pairIndex => PriceFeed) private _feeds;
    bool public broken;

    function setPrice(uint256 pairIndex, uint256 price, uint256 decimals, uint256 time) external {
        PriceFeed storage feed = _feeds[pairIndex];
        feed.round += 1;
        feed.price = price;
        feed.decimals = decimals;
        feed.time = time;
    }

    /// @dev Simulates an unavailable oracle (paused contract, removed pair).
    function setBroken(bool broken_) external {
        broken = broken_;
    }

    function getSvalue(uint256 pairIndex) external view returns (PriceFeed memory) {
        require(!broken, "supra unavailable");
        return _feeds[pairIndex];
    }
}
