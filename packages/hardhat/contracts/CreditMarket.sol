// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { ISaucerSwapV1Pair, ISaucerSwapV2Pool } from "./interfaces/ISaucerSwap.sol";
import { DmrvRegistry } from "./DmrvRegistry.sol";

/// @title CreditMarket
/// @notice Fixed-USD-price listings of `DmrvRegistry` credits, settled in HBAR at the HBAR/USD oracle price
/// (`ResilientHbarUsdFeed`: Chainlink, with Supra as a checked fallback). Listed credits are escrowed in registry
/// custody under this contract's address; the market never touches HTS. `buyAndRetire` retires in the same
/// transaction and the registry mints the certificate NFT.
/// @dev Optional on-chain cross-check: when the SaucerSwap guard is enabled, every settlement also reads the
/// WHBAR/USDC pool (V1 `getReserves` or V2 `slot0`) and reverts if the pool's HBAR price is more than
/// `maxDeviationBps` away from the oracle price, or if the pool is below `minLiquidity`. Settlement always uses
/// the oracle price. The pool is only a circuit breaker against a wrong oracle; its spot price can be moved inside
/// one transaction, so an attacker can at most block purchases, never change what a buyer pays.
contract CreditMarket is AccessControl, ReentrancyGuard {
    uint16 public constant MAX_BPS = 10_000;
    /// @notice The admin cannot loosen the pool bound beyond 20%.
    uint16 public constant MAX_POOL_DEVIATION_BPS = 2_000;
    uint256 public constant UNITS_PER_CREDIT = 1_000;
    /// @notice The admin cannot switch the settlement staleness check off. Two days covers a missed heartbeat.
    uint32 public constant MAX_PRICE_AGE = 2 days;

    DmrvRegistry public immutable REGISTRY;
    AggregatorV3Interface public immutable HBAR_USD_FEED;
    /// @notice Native units per HBAR as seen by `msg.value`: 1e8 (tinybar) on Hedera, 1e18 on a local Hardhat EVM.
    uint256 public immutable NATIVE_UNITS_PER_HBAR;

    struct Listing {
        address seller;
        uint64 unitsAvailable;
        uint64 priceUsdCentsPerTonne;
        bool active;
    }

    /// @notice SaucerSwap WHBAR/USD-stablecoin pool used to cross-check the oracle.
    struct PoolGuard {
        address pool;
        /// @dev false: V1 pair (`getReserves`); true: V2 concentrated-liquidity pool (`slot0`).
        bool isV2;
        bool whbarIsToken0;
        bool enabled;
        uint8 whbarDecimals;
        uint8 usdDecimals;
        uint16 maxDeviationBps;
        /// @dev V1: minimum USD-side reserve in base units. V2: minimum in-range `liquidity()`.
        uint128 minLiquidity;
    }

    uint32 public maxPriceAge;
    uint256 public totalProceedsOwed;
    PoolGuard public poolGuard;
    mapping(address seller => uint256 native) public proceedsOf;
    Listing[] private _listings;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint64 units, uint64 priceUsdCentsPerTonne);
    event ListingCancelled(uint256 indexed listingId, uint64 unitsReturned);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint64 units, uint256 nativePaid);
    event PurchasedAndRetired(uint256 indexed listingId, address indexed buyer, uint256 indexed retirementId);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);
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
    error InvalidListing(uint256 listingId);
    error NotSeller(uint256 listingId);
    error InsufficientListingUnits(uint64 requested, uint64 available);
    error InsufficientPayment(uint256 required, uint256 provided);
    error InvalidPrice(int256 answer);
    error StalePrice(uint256 updatedAt, uint32 maxPriceAge);
    error PriceAgeOutOfRange(uint32 maxPriceAge);
    error NativeTransferFailed();
    error InvalidPoolGuard();
    error PoolIlliquid(address pool, uint256 liquidity, uint128 minLiquidity);
    error PoolPriceDeviation(uint256 poolPrice, uint256 oraclePrice, uint256 deviationBps);

    constructor(
        address admin,
        DmrvRegistry registry,
        AggregatorV3Interface hbarUsdFeed,
        uint256 nativeUnitsPerHbar,
        uint32 maxPriceAge_
    ) {
        if (admin == address(0) || address(registry) == address(0) || address(hbarUsdFeed) == address(0)) {
            revert ZeroAddress();
        }
        if (maxPriceAge_ == 0 || maxPriceAge_ > MAX_PRICE_AGE) revert PriceAgeOutOfRange(maxPriceAge_);
        REGISTRY = registry;
        HBAR_USD_FEED = hbarUsdFeed;
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
    /// the USD stablecoin. Pass `enabled = false` to store the pool without enforcing it (e.g. an illiquid testnet
    /// pool whose price is nowhere near the market).
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
        if (maxDeviationBps == 0 || maxDeviationBps > MAX_POOL_DEVIATION_BPS) revert InvalidPoolGuard();
        if (whbarDecimals > 18 || usdDecimals > 18) revert InvalidPoolGuard();
        address token0 = ISaucerSwapV1Pair(pool).token0();
        bool whbarIsToken0 = token0 == whbar;
        if (!whbarIsToken0 && ISaucerSwapV1Pair(pool).token1() != whbar) revert InvalidPoolGuard();
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

    /// @notice Switches the pool cross-check on or off without changing its configuration.
    function setPoolGuardEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled && poolGuard.pool == address(0)) revert InvalidPoolGuard();
        poolGuard.enabled = enabled;
        emit PoolGuardEnabled(enabled);
    }

    /// @notice Recovers HBAR that is not owed to sellers.
    function sweepHbar(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        _sendNative(to, address(this).balance - totalProceedsOwed);
    }

    // ─── Market ──────────────────────────────────────────────────────────────

    /// @notice Lists `units` (kg CO2e) from the caller's registry custody at a USD price per tonne.
    function createListing(
        uint64 units,
        uint64 priceUsdCentsPerTonne
    ) external nonReentrant returns (uint256 listingId) {
        if (priceUsdCentsPerTonne == 0) revert ZeroAmount();
        REGISTRY.moveCustody(msg.sender, address(this), units);
        listingId = _listings.length;
        _listings.push(Listing(msg.sender, units, priceUsdCentsPerTonne, true));
        emit ListingCreated(listingId, msg.sender, units, priceUsdCentsPerTonne);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _activeListing(listingId);
        if (listing.seller != msg.sender) revert NotSeller(listingId);
        uint64 remaining = listing.unitsAvailable;
        listing.unitsAvailable = 0;
        listing.active = false;
        REGISTRY.moveCustody(address(this), msg.sender, remaining);
        emit ListingCancelled(listingId, remaining);
    }

    /// @notice Buys `units` into the caller's registry custody. Excess payment is refunded.
    function buy(uint256 listingId, uint64 units) external payable nonReentrant {
        uint256 refund = _purchase(listingId, units);
        REGISTRY.moveCustody(address(this), msg.sender, units);
        _sendNative(msg.sender, refund);
    }

    /// @notice Buys `units` and retires them in the same transaction (the registry issues the certificate NFT).
    function buyAndRetire(
        uint256 listingId,
        uint64 units,
        string calldata beneficiary
    ) external payable nonReentrant returns (uint256 retirementId) {
        uint256 refund = _purchase(listingId, units);
        REGISTRY.moveCustody(address(this), msg.sender, units);
        retirementId = REGISTRY.retireFor(msg.sender, units, beneficiary);
        emit PurchasedAndRetired(listingId, msg.sender, retirementId);
        _sendNative(msg.sender, refund);
    }

    function withdrawProceeds() external nonReentrant {
        uint256 amount = proceedsOf[msg.sender];
        if (amount == 0) revert ZeroAmount();
        proceedsOf[msg.sender] = 0;
        totalProceedsOwed -= amount;
        _sendNative(msg.sender, amount);
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    // ─── Pricing ─────────────────────────────────────────────────────────────

    /// @notice Native amount (tinybar on Hedera) required to buy `units` kg from `listingId` at the oracle price.
    function quote(uint256 listingId, uint64 units) public view returns (uint256 nativeCost) {
        Listing storage listing = _activeListing(listingId);
        if (units == 0) revert ZeroAmount();
        if (units > listing.unitsAvailable) revert InsufficientListingUnits(units, listing.unitsAvailable);
        return usdCentsPerTonneToNative(listing.priceUsdCentsPerTonne, units);
    }

    /// @notice Converts a USD price per tonne into the native amount for `units` kg, rounding up.
    function usdCentsPerTonneToNative(uint64 priceUsdCentsPerTonne, uint64 units) public view returns (uint256) {
        (uint256 answer, uint8 feedDecimals) = settlementPrice();
        uint256 numerator = uint256(priceUsdCentsPerTonne) * units * (10 ** feedDecimals) * NATIVE_UNITS_PER_HBAR;
        uint256 denominator = 100 * UNITS_PER_CREDIT * answer;
        return (numerator + denominator - 1) / denominator;
    }

    /// @notice The fresh oracle HBAR/USD price, after the SaucerSwap cross-check when it is enabled.
    function settlementPrice() public view returns (uint256 answer, uint8 decimals) {
        (uint80 roundId, int256 rawAnswer, , uint256 updatedAt, uint80 answeredInRound) = HBAR_USD_FEED
            .latestRoundData();
        if (rawAnswer <= 0 || updatedAt == 0 || answeredInRound < roundId) revert InvalidPrice(rawAnswer);
        if (block.timestamp - updatedAt > maxPriceAge) revert StalePrice(updatedAt, maxPriceAge);
        answer = uint256(rawAnswer);
        decimals = HBAR_USD_FEED.decimals();
        PoolGuard memory g = poolGuard;
        if (g.enabled) {
            uint256 poolPrice = poolHbarUsd(decimals);
            uint256 diff = poolPrice > answer ? poolPrice - answer : answer - poolPrice;
            uint256 deviationBps = (diff * MAX_BPS) / answer;
            if (deviationBps > g.maxDeviationBps) revert PoolPriceDeviation(poolPrice, answer, deviationBps);
        }
    }

    /// @notice HBAR price in USD implied by the configured SaucerSwap pool, scaled to `decimals`.
    /// Reverts when the pool is below the configured liquidity floor.
    function poolHbarUsd(uint8 decimals) public view returns (uint256) {
        PoolGuard memory g = poolGuard;
        if (g.pool == address(0)) revert InvalidPoolGuard();
        uint256 scale = 10 ** (uint256(decimals) + g.whbarDecimals);
        uint256 usdUnit = 10 ** uint256(g.usdDecimals);
        if (!g.isV2) {
            (uint112 r0, uint112 r1, ) = ISaucerSwapV1Pair(g.pool).getReserves();
            (uint256 hbarReserve, uint256 usdReserve) = g.whbarIsToken0
                ? (uint256(r0), uint256(r1))
                : (uint256(r1), uint256(r0));
            if (hbarReserve == 0 || usdReserve < g.minLiquidity)
                revert PoolIlliquid(g.pool, usdReserve, g.minLiquidity);
            return Math.mulDiv(usdReserve, scale, hbarReserve * usdUnit);
        }
        (uint160 sqrtPriceX96, , , , , , ) = ISaucerSwapV2Pool(g.pool).slot0();
        uint128 liquidity = ISaucerSwapV2Pool(g.pool).liquidity();
        if (sqrtPriceX96 == 0 || liquidity < g.minLiquidity) revert PoolIlliquid(g.pool, liquidity, g.minLiquidity);
        // token1 per token0, in base units, as a Q96 fixed-point number.
        uint256 priceX96 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 96);
        if (g.whbarIsToken0) return Math.mulDiv(priceX96, scale, 1 << 96) / usdUnit;
        return Math.mulDiv(1 << 96, scale, priceX96) / usdUnit;
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function listingCount() external view returns (uint256) {
        return _listings.length;
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    function getListings(uint256 start, uint256 count) external view returns (Listing[] memory page) {
        uint256 length = _listings.length;
        uint256 end = start >= length ? start : (start + count > length ? length : start + count);
        page = new Listing[](end - start);
        for (uint256 i = start; i < end; i++) page[i - start] = _listings[i];
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    function _purchase(uint256 listingId, uint64 units) private returns (uint256 refund) {
        Listing storage listing = _activeListing(listingId);
        uint256 cost = quote(listingId, units);
        if (msg.value < cost) revert InsufficientPayment(cost, msg.value);
        listing.unitsAvailable -= units;
        if (listing.unitsAvailable == 0) listing.active = false;
        proceedsOf[listing.seller] += cost;
        totalProceedsOwed += cost;
        emit Purchased(listingId, msg.sender, units, cost);
        return msg.value - cost;
    }

    function _activeListing(uint256 listingId) private view returns (Listing storage listing) {
        if (listingId >= _listings.length) revert InvalidListing(listingId);
        listing = _listings[listingId];
        if (!listing.active) revert InvalidListing(listingId);
    }

    function _sendNative(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{ value: amount }("");
        if (!ok) revert NativeTransferFailed();
    }
}
