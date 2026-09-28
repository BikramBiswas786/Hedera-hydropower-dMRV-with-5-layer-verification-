// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { HederaTokenLib } from "./lib/HederaTokenLib.sol";
import { UsdSettlement } from "./settlement/UsdSettlement.sol";

/// @title UsdCheckout
/// @notice Sells any HTS fungible token at a fixed US-cent price per whole token, paid in HBAR. Tickets, real-world
/// asset shares, credits, in-game items: the seller escrows tokens here and a buyer pays the HBAR the oracle says the
/// dollars are worth, which SaucerSwap converts to the pair's USD token for the seller (`UsdSettlement`).
/// @dev The same settlement as `CreditMarket`, without a registry: the contract holds the listed tokens itself, so
/// `IERC20(token).balanceOf(this)` equals the sum of the active listings' `available` for every token. The admin
/// configures the oracle band and the pool; it cannot move escrowed tokens.
contract UsdCheckout is UsdSettlement {
    struct Listing {
        address seller;
        address token;
        uint64 available;
        uint64 priceUsdCentsPerToken;
        uint8 tokenDecimals;
        bool active;
    }

    Listing[] private _listings;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        address indexed token,
        uint64 amount,
        uint64 priceUsdCentsPerToken
    );
    event ListingCancelled(uint256 indexed listingId, uint64 amountReturned);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint64 amount, uint256 nativePaid);

    error InvalidListing(uint256 listingId);
    error NotSeller(uint256 listingId);
    error InsufficientListingAmount(uint64 requested, uint64 available);
    error UnsupportedDecimals(uint8 decimals);

    constructor(
        address admin,
        AggregatorV3Interface hbarUsdFeed,
        uint256 nativeUnitsPerHbar,
        uint32 maxPriceAge_,
        address saucerFactory,
        address router
    ) UsdSettlement(admin, hbarUsdFeed, nativeUnitsPerHbar, maxPriceAge_, saucerFactory, router) {}

    // ─── Seller ──────────────────────────────────────────────────────────────

    /// @notice Escrows `amount` base units of `token` and lists them at `priceUsdCentsPerToken` per whole token.
    /// @dev Approve this contract on the token first (its ERC-20 `approve`). The contract associates itself with the
    /// token on first use; the seller must be associated with the settlement pair's USD token to be paid.
    function createListing(
        address token,
        uint64 amount,
        uint64 priceUsdCentsPerToken
    ) external nonReentrant returns (uint256 listingId) {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0 || priceUsdCentsPerToken == 0) revert ZeroAmount();
        uint8 decimals = IERC20Metadata(token).decimals();
        // 10^18 base units per token keeps the cost numerator far inside uint256 at any uint64 price and amount.
        if (decimals > 18) revert UnsupportedDecimals(decimals);
        HederaTokenLib.associateSelf(token);
        HederaTokenLib.transferFrom(token, msg.sender, address(this), amount);
        listingId = _listings.length;
        _listings.push(Listing(msg.sender, token, amount, priceUsdCentsPerToken, decimals, true));
        emit ListingCreated(listingId, msg.sender, token, amount, priceUsdCentsPerToken);
    }

    /// @notice Returns what is left of a listing to its seller.
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _activeListing(listingId);
        if (listing.seller != msg.sender) revert NotSeller(listingId);
        uint64 remaining = listing.available;
        listing.available = 0;
        listing.active = false;
        HederaTokenLib.transferFromSelf(listing.token, msg.sender, remaining);
        emit ListingCancelled(listingId, remaining);
    }

    // ─── Buyer ───────────────────────────────────────────────────────────────

    /// @notice Buys `amount` base units. Send at least `quote(listingId, amount)`; the excess is refunded. The buyer
    /// must be associated with the token, or HTS refuses the transfer and the purchase reverts.
    function buy(uint256 listingId, uint64 amount) external payable nonReentrant {
        Listing storage listing = _activeListing(listingId);
        uint256 cost = quote(listingId, amount);
        uint256 minOut = minUsdOut(listingId, amount);
        listing.available -= amount;
        if (listing.available == 0) listing.active = false;
        uint256 refund = _settle(listing.seller, cost, minOut);
        HederaTokenLib.transferFromSelf(listing.token, msg.sender, amount);
        emit Purchased(listingId, msg.sender, amount, cost);
        _sendNative(msg.sender, refund);
    }

    // ─── Pricing ─────────────────────────────────────────────────────────────

    /// @notice Native amount (tinybar on Hedera) for `amount` base units at the oracle price, rounded up.
    function quote(uint256 listingId, uint64 amount) public view returns (uint256 nativeCost) {
        Listing storage listing = _activeListing(listingId);
        if (amount == 0) revert ZeroAmount();
        if (amount > listing.available) revert InsufficientListingAmount(amount, listing.available);
        return _usdCentsToNative(uint256(listing.priceUsdCentsPerToken) * amount, 10 ** listing.tokenDecimals);
    }

    /// @notice Least USD-token base units the seller must receive for `amount`, after the swap slippage band.
    function minUsdOut(uint256 listingId, uint64 amount) public view returns (uint256) {
        Listing storage listing = _activeListing(listingId);
        return _minUsdOut(uint256(listing.priceUsdCentsPerToken) * amount, 10 ** listing.tokenDecimals);
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

    function _activeListing(uint256 listingId) private view returns (Listing storage listing) {
        if (listingId >= _listings.length) revert InvalidListing(listingId);
        listing = _listings[listingId];
        if (!listing.active) revert InvalidListing(listingId);
    }
}
