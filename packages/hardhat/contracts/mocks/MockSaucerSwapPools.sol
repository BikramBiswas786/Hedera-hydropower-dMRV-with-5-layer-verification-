// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISaucerFactory, ISaucerSwapV1Pair } from "../interfaces/ISaucerSwap.sol";

/// @notice Settable SaucerSwap V1 pair for tests.
contract MockSaucerSwapV1Pair is ISaucerSwapV1Pair {
    address public override factory;
    address public immutable override token0;
    address public immutable override token1;
    uint112 private _reserve0;
    uint112 private _reserve1;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setFactory(address factory_) external {
        factory = factory_;
    }

    function setReserves(uint112 reserve0, uint112 reserve1) external {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
    }

    function getReserves() external view override returns (uint112, uint112, uint32) {
        return (_reserve0, _reserve1, uint32(block.timestamp));
    }
}

/// @notice SaucerSwap V1 factory for tests: records pairs the way `createPair` would.
contract MockSaucerFactory is ISaucerFactory {
    mapping(address => mapping(address => address)) public override getPair;

    function setPair(address tokenA, address tokenB, address pair) external {
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
    }
}
