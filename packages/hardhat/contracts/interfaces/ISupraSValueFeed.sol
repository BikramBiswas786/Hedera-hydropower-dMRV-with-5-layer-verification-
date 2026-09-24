// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Supra push oracle ("S-Value feed") read interface, as deployed on Hedera.
/// @dev `time` is reported in milliseconds on some deployments and seconds on others; consumers must normalise.
interface ISupraSValueFeed {
    struct PriceFeed {
        uint256 round;
        uint256 decimals;
        uint256 time;
        uint256 price;
    }

    function getSvalue(uint256 pairIndex) external view returns (PriceFeed memory priceFeed);
}
