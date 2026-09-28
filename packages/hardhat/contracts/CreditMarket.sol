// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { UsdSettlement } from "./settlement/UsdSettlement.sol";
import { DmrvRegistry } from "./DmrvRegistry.sol";

/// @title CreditMarket
/// @notice Fixed-USD-price listings of `DmrvRegistry` credits, settled in HBAR at the HBAR/USD oracle price
/// (`ResilientHbarUsdFeed`: Chainlink, with Supra as a checked fallback). Listed credits are escrowed in registry
/// custody under this contract's address; the market never touches HTS. `buyAndRetire` retires in the same
/// transaction and the registry mints the certificate NFT.
/// @dev A purchase sends the oracle HBAR amount into `ROUTER.swapExactETHForTokens` and requires the
/// SaucerSwap pool to pay the seller at least the listing's USD minus `SWAP_SLIPPAGE_BPS` (`UsdSettlement`).
/// Removing the router call removes the sale. There is no HBAR payout to the seller.
contract CreditMarket is UsdSettlement {
    uint256 public constant UNITS_PER_CREDIT = 1_000;

    DmrvRegistry public immutable REGISTRY;

    struct Listing {
        address seller;
        uint64 unitsAvailable;
        uint64 priceUsdCentsPerTonne;
        bool active;
    }

    Listing[] private _listings;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint64 units, uint64 priceUsdCentsPerTonne);
    event ListingCancelled(uint256 indexed listingId, uint64 unitsReturned);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint64 units, uint256 nativePaid);
    event PurchasedAndRetired(uint256 indexed listingId, address indexed buyer, uint256 indexed retirementId);

    error InvalidListing(uint256 listingId);
    error NotSeller(uint256 listingId);
    error InsufficientListingUnits(uint64 requested, uint64 available);

    constructor(
        address admin,
        DmrvRegistry registry,
        AggregatorV3Interface hbarUsdFeed,
        uint256 nativeUnitsPerHbar,
        uint32 maxPriceAge_,
        address saucerFactory,
        address router
    ) UsdSettlement(admin, hbarUsdFeed, nativeUnitsPerHbar, maxPriceAge_, saucerFactory, router) {
        if (address(registry) == address(0)) revert ZeroAddress();
        REGISTRY = registry;
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

    // ─── Pricing ─────────────────────────────────────────────────────────────

    /// @notice Minimum USD-token units the seller must receive for `units`, after the swap slippage band.
    function minUsdOut(uint256 listingId, uint64 units) public view returns (uint256) {
        Listing storage listing = _activeListing(listingId);
        return _minUsdOut(uint256(listing.priceUsdCentsPerTonne) * units, UNITS_PER_CREDIT);
    }

    /// @notice Native amount (tinybar on Hedera) required to buy `units` kg from `listingId` at the oracle price.
    function quote(uint256 listingId, uint64 units) public view returns (uint256 nativeCost) {
        Listing storage listing = _activeListing(listingId);
        if (units == 0) revert ZeroAmount();
        if (units > listing.unitsAvailable) revert InsufficientListingUnits(units, listing.unitsAvailable);
        return usdCentsPerTonneToNative(listing.priceUsdCentsPerTonne, units);
    }

    /// @notice Converts a USD price per tonne into the native amount for `units` kg, rounding up.
    function usdCentsPerTonneToNative(uint64 priceUsdCentsPerTonne, uint64 units) public view returns (uint256) {
        return _usdCentsToNative(uint256(priceUsdCentsPerTonne) * units, UNITS_PER_CREDIT);
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
        uint256 minOut = minUsdOut(listingId, units);
        listing.unitsAvailable -= units;
        if (listing.unitsAvailable == 0) listing.active = false;
        refund = _settle(listing.seller, cost, minOut);
        emit Purchased(listingId, msg.sender, units, cost);
    }

    function _activeListing(uint256 listingId) private view returns (Listing storage listing) {
        if (listingId >= _listings.length) revert InvalidListing(listingId);
        listing = _listings[listingId];
        if (!listing.active) revert InvalidListing(listingId);
    }
}
