// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice SaucerSwap V1 pair (Uniswap V2 fork). Source: saucerswaplabs/saucerswaplabs-core,
/// contracts/interfaces/IUniswapV2Pair.sol (`getReserves`, `token0`, `token1`).
interface ISaucerSwapV1Pair {
    function token0() external view returns (address);

    function token1() external view returns (address);

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/// @notice SaucerSwap V2 pool (Uniswap V3 fork). Source: saucerswaplabs/saucerswaplabs-v2-core,
/// contracts/interfaces/pool/IUniswapV3PoolState.sol (`slot0`, `liquidity`).
interface ISaucerSwapV2Pool {
    function token0() external view returns (address);

    function token1() external view returns (address);

    function liquidity() external view returns (uint128);

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}
