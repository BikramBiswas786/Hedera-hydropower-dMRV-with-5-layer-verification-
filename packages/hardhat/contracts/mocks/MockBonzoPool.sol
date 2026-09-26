// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Aave-shaped `getReserveData` return, enough for `CreditMarket` to require an active reserve.
contract MockBonzoPool {
    uint256 public configuration;
    address public aToken;

    constructor(address aToken_) {
        aToken = aToken_;
        configuration = uint256(1) << 56;
    }

    function setActive(bool on) external {
        configuration = on ? uint256(1) << 56 : 0;
    }

    function getReserveData(
        address
    )
        external
        view
        returns (uint256, uint128, uint128, uint128, uint128, uint128, uint40, address, address, address, address, uint8)
    {
        return (configuration, 0, 0, 0, 0, 0, 0, aToken, address(0), address(0), address(0), 0);
    }
}
