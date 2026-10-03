// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { AggregatorV3Interface } from "../interfaces/AggregatorV3Interface.sol";
import { ISaucerFactory, ISaucerRouter, ISaucerSwapV1Pair } from "../interfaces/ISaucerSwap.sol";

/// @title UsdSettlement
/// @notice Prices a sale in US cents and settles it in HBAR: the amount comes from an HBAR/USD feed
/// (`ResilientHbarUsdFeed`: Chainlink, with Supra as a checked fallback), and the HBAR is swapped through a
/// SaucerSwap V1 pair so the seller receives the pair's USD token. The pair must sit within `maxDeviationBps` of the
/// feed and hold at least `minLiquidity`, or nothing is sold; a manipulated pool can block a sale but never make it
/// cheaper, because the buyer always pays the feed's amount.
/// @dev Inherited by `CreditMarket` (registry credits) and `UsdCheckout` (any HTS fungible token).
abstract contract UsdSettlement is AccessControl, ReentrancyGuard {
    uint16 public constant MAX_BPS = 10_000;
    /// @notice The admin cannot loosen the pool bound beyond 20%.
    uint16 public constant MAX_POOL_DEVIATION_BPS = 2_000;
    /// @notice The admin cannot switch the settlement staleness check off. Two days covers a missed heartbeat.
    uint32 public constant MAX_PRICE_AGE = 2 days;
    /// @notice Execution band versus the sale's USD amount. The spot check is separate (`maxDeviationBps`).
    uint16 public constant SWAP_SLIPPAGE_BPS = 300;

    AggregatorV3Interface public immutable HBAR_USD_FEED;
    /// @notice SaucerSwap factory. `setPoolGuard` reverts unless this factory's `getPair` returns the pool.
    address public immutable SAUCER_FACTORY;
    /// @notice SaucerSwap V1 router. Every purchase swaps through it.
    address public immutable ROUTER;
    /// @notice Native units per HBAR as seen by `msg.value`: 1e8 (tinybar) on Hedera, 1e18 on a local Hardhat EVM.
    uint256 public immutable NATIVE_UNITS_PER_HBAR;

    /// @notice SaucerSwap WHBAR/USD-stablecoin pool used to cross-check the oracle and to pay the seller.
    struct PoolGuard {
        address pool;
        /// @dev Always false: purchases swap through the V1 router, so the guard must price the V1 pair it swaps.
        /// Kept so the struct (and every reader of `poolGuard()`) keeps its shape.
        bool isV2;
        bool whbarIsToken0;
        bool enabled;
        uint8 whbarDecimals;
        uint8 usdDecimals;
        uint16 maxDeviationBps;
        /// @dev Minimum USD-side reserve in base units.
        uint128 minLiquidity;
    }

    uint32 public maxPriceAge;
    PoolGuard public poolGuard;

    event MaxPriceAgeChanged(uint32 maxPriceAge);
    event PoolGuardSet(
        address indexed pool,
        bool isV2,
        bool whbarIsToken0,
        uint16 maxDeviationBps,
        uint128 minLiquidity,
        bool enabled
    );
    event PoolGuardEnabled(bool enabled);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientPayment(uint256 required, uint256 provided);
    error InvalidPrice(int256 answer);
    error StalePrice(uint256 updatedAt, uint32 maxPriceAge);
    error PriceAgeOutOfRange(uint32 maxPriceAge);
    error NativeTransferFailed();
    error InvalidPoolGuard();
    error PoolIlliquid(address pool, uint256 liquidity, uint128 minLiquidity);
    error PoolPriceDeviation(uint256 poolPrice, uint256 oraclePrice, uint256 deviationBps);
    error SwapFailed();

    constructor(
        address admin,
        AggregatorV3Interface hbarUsdFeed,
        uint256 nativeUnitsPerHbar,
        uint32 maxPriceAge_,
        address saucerFactory,
        address router
    ) {
        if (
            admin == address(0) ||
            address(hbarUsdFeed) == address(0) ||
            saucerFactory == address(0) ||
            router == address(0)
        ) {
            revert ZeroAddress();
        }
        if (maxPriceAge_ == 0 || maxPriceAge_ > MAX_PRICE_AGE) revert PriceAgeOutOfRange(maxPriceAge_);
        HBAR_USD_FEED = hbarUsdFeed;
        SAUCER_FACTORY = saucerFactory;
        ROUTER = router;
        NATIVE_UNITS_PER_HBAR = nativeUnitsPerHbar;
        maxPriceAge = maxPriceAge_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setMaxPriceAge(uint32 maxPriceAge_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (maxPriceAge_ == 0 || maxPriceAge_ > MAX_PRICE_AGE) revert PriceAgeOutOfRange(maxPriceAge_);
        maxPriceAge = maxPriceAge_;
        emit MaxPriceAgeChanged(maxPriceAge_);
    }

    /// @notice Configures the SaucerSwap cross-check. `whbar` must be one of the pool's two tokens; the other is
    /// the USD stablecoin. `enabled` must be true. A purchase with no pool, or with this flag cleared, reverts.
    function setPoolGuard(
        address pool,
        bool isV2,
        address whbar,
        uint8 whbarDecimals,
        uint8 usdDecimals,
        uint16 maxDeviationBps,
        uint128 minLiquidity,
        bool enabled
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (pool == address(0) || whbar == address(0)) revert ZeroAddress();
        // A V2 pool is not what the V1 router swaps through, so it cannot vouch for the swap.
        if (isV2 || !enabled || maxDeviationBps == 0 || maxDeviationBps > MAX_POOL_DEVIATION_BPS) {
            revert InvalidPoolGuard();
        }
        if (whbarDecimals > 18 || usdDecimals > 18) revert InvalidPoolGuard();
        address token0 = ISaucerSwapV1Pair(pool).token0();
        address token1 = ISaucerSwapV1Pair(pool).token1();
        // Ask the factory, not the pool: a homemade contract can return SaucerSwap's address from `factory()`.
        if (ISaucerFactory(SAUCER_FACTORY).getPair(token0, token1) != pool) revert InvalidPoolGuard();
        bool whbarIsToken0 = token0 == whbar;
        if (!whbarIsToken0 && token1 != whbar) revert InvalidPoolGuard();
        poolGuard = PoolGuard({
            pool: pool,
            isV2: isV2,
            whbarIsToken0: whbarIsToken0,
            enabled: enabled,
            whbarDecimals: whbarDecimals,
            usdDecimals: usdDecimals,
            maxDeviationBps: maxDeviationBps,
            minLiquidity: minLiquidity
        });
        emit PoolGuardSet(pool, isV2, whbarIsToken0, maxDeviationBps, minLiquidity, enabled);
    }

    /// @notice Turns the pool check on. Turning it off reverts: a sale without SaucerSwap is not a sale.
    function setPoolGuardEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!enabled || poolGuard.pool == address(0)) revert InvalidPoolGuard();
        poolGuard.enabled = true;
        emit PoolGuardEnabled(true);
    }

    /// @notice HBAR a buyer locked for a purchase Hedera has not settled. `sweepHbar` cannot take it.
    uint256 public reservedNative;

    /// @notice Recovers HBAR left in this contract. Purchases swap through the router, so the free balance is
    /// normally 0. HBAR reserved for a scheduled purchase is not free.
    function sweepHbar(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        _sendNative(to, address(this).balance - reservedNative);
    }

    // ─── Pricing ─────────────────────────────────────────────────────────────

    /// @notice The fresh oracle HBAR/USD price, after the SaucerSwap pool agrees within the pinned band.
    function settlementPrice() public view returns (uint256 answer, uint8 decimals) {
        (uint80 roundId, int256 rawAnswer, , uint256 updatedAt, uint80 answeredInRound) = HBAR_USD_FEED
            .latestRoundData();
        if (rawAnswer <= 0 || updatedAt == 0 || answeredInRound < roundId) revert InvalidPrice(rawAnswer);
        if (block.timestamp - updatedAt > maxPriceAge) revert StalePrice(updatedAt, maxPriceAge);
        answer = uint256(rawAnswer);
        decimals = HBAR_USD_FEED.decimals();
        PoolGuard memory g = poolGuard;
        if (g.pool == address(0) || !g.enabled) revert InvalidPoolGuard();
        uint256 poolPrice = poolHbarUsd(decimals);
        uint256 diff = poolPrice > answer ? poolPrice - answer : answer - poolPrice;
        uint256 deviationBps = (diff * MAX_BPS) / answer;
        if (deviationBps > g.maxDeviationBps) revert PoolPriceDeviation(poolPrice, answer, deviationBps);
    }

    /// @notice HBAR price in USD implied by the configured SaucerSwap V1 pair's reserves, scaled to `decimals`.
    /// Reverts when the pool is below the configured liquidity floor.
    function poolHbarUsd(uint8 decimals) public view returns (uint256) {
        PoolGuard memory g = poolGuard;
        if (g.pool == address(0)) revert InvalidPoolGuard();
        uint256 scale = 10 ** (uint256(decimals) + g.whbarDecimals);
        uint256 usdUnit = 10 ** uint256(g.usdDecimals);
        (uint112 r0, uint112 r1, ) = ISaucerSwapV1Pair(g.pool).getReserves();
        (uint256 hbarReserve, uint256 usdReserve) = g.whbarIsToken0
            ? (uint256(r0), uint256(r1))
            : (uint256(r1), uint256(r0));
        if (hbarReserve == 0 || usdReserve < g.minLiquidity) revert PoolIlliquid(g.pool, usdReserve, g.minLiquidity);
        return Math.mulDiv(usdReserve, scale, hbarReserve * usdUnit);
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    /// @dev Native amount for `usdCents / per` US cents at the settlement price, rounded up so the buyer never
    /// underpays. `per` is the number of base units the price is quoted for (1,000 kg per tonne, 10^decimals per token).
    function _usdCentsToNative(uint256 usdCents, uint256 per) internal view returns (uint256) {
        (uint256 answer, uint8 feedDecimals) = settlementPrice();
        uint256 numerator = usdCents * (10 ** feedDecimals) * NATIVE_UNITS_PER_HBAR;
        uint256 denominator = 100 * per * answer;
        return (numerator + denominator - 1) / denominator;
    }

    /// @dev Least USD-token base units the seller must receive for `usdCents / per` cents, after the slippage band.
    function _minUsdOut(uint256 usdCents, uint256 per) internal view returns (uint256) {
        uint256 gross = (usdCents * (10 ** uint256(poolGuard.usdDecimals))) / (100 * per);
        if (gross == 0) revert ZeroAmount();
        return (gross * (MAX_BPS - SWAP_SLIPPAGE_BPS)) / MAX_BPS;
    }

    /// @dev Takes `cost` out of `msg.value`, swaps it to the USD token for `seller` and returns the excess to refund.
    function _settle(address seller, uint256 cost, uint256 minOut) internal returns (uint256 refund) {
        if (msg.value < cost) revert InsufficientPayment(cost, msg.value);
        _swapToSeller(seller, cost, minOut);
        return msg.value - cost;
    }

    /// @dev Forwards `nativeCost` into the SaucerSwap router. The seller receives the USD token, not HBAR.
    function _swapToSeller(address seller, uint256 nativeCost, uint256 minOut) internal {
        PoolGuard memory g = poolGuard;
        address token0 = ISaucerSwapV1Pair(g.pool).token0();
        address token1 = ISaucerSwapV1Pair(g.pool).token1();
        address[] memory path = new address[](2);
        path[0] = g.whbarIsToken0 ? token0 : token1;
        path[1] = g.whbarIsToken0 ? token1 : token0;
        try
            ISaucerRouter(ROUTER).swapExactETHForTokens{ value: nativeCost }(minOut, path, seller, block.timestamp)
        returns (uint256[] memory) {} catch {
            revert SwapFailed();
        }
    }

    function _sendNative(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{ value: amount }("");
        if (!ok) revert NativeTransferFailed();
    }
}
