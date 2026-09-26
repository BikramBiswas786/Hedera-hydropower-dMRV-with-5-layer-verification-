// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISaucerSwapV1Pair, ISaucerSwapV2Pool } from "../interfaces/ISaucerSwap.sol";

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

/// @notice Settable SaucerSwap V2 pool for tests.
contract MockSaucerSwapV2Pool is ISaucerSwapV2Pool {
    address public override factory;
    address public immutable override token0;
    address public immutable override token1;
    uint160 private _sqrtPriceX96;
    uint128 public override liquidity;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setFactory(address factory_) external {
        factory = factory_;
    }

    function setState(uint160 sqrtPriceX96, uint128 liquidity_) external {
        _sqrtPriceX96 = sqrtPriceX96;
        liquidity = liquidity_;
    }

    function slot0() external view override returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (_sqrtPriceX96, 0, 0, 1, 1, 0, true);
    }
}
