// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice SaucerSwap V1 pair (Uniswap V2 fork). Source: saucerswaplabs/saucerswaplabs-core,
/// contracts/interfaces/IUniswapV2Pair.sol (`getReserves`, `token0`, `token1`).
interface ISaucerSwapV1Pair {
    function factory() external view returns (address);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

/// @notice SaucerSwap V1 factory (Uniswap V2 fork). `getPair` is the factory's own record of the pairs it created.
interface ISaucerFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @notice SaucerSwap V1 router. A purchase calls `swapExactETHForTokens`; if this reverts, the sale reverts.
interface ISaucerRouter {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}
