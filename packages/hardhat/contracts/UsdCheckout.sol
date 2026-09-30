// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
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
    event TraceSignerSet(address indexed signer);
    event TraceRequiredSet(address indexed token, bool required);

    error InvalidListing(uint256 listingId);
    error NotSeller(uint256 listingId);
    error InsufficientListingAmount(uint64 requested, uint64 available);
    error UnsupportedDecimals(uint8 decimals);
    /// @notice `buy` was called for a token that only `buyTraced` may sell.
    error TraceRequired(address token);
    error TraceNotRequired(address token);
    error EmptyTrace();
    error TraceExpired(uint64 validUntil);
    error BadTrace(address signer);

    /// @notice Signs `traceDigest` for tokens in `traceRequired`. Unset until the admin names one.
    address public traceSigner;
    /// @notice When true, `buy` reverts and only `buyTraced` can sell this token.
    mapping(address token => bool) public traceRequired;

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
    /// @dev Reverts for a token the admin marked with `setTraceRequired`. Those sales go through `buyTraced`.
    function buy(uint256 listingId, uint64 amount) external payable nonReentrant {
        Listing storage listing = _activeListing(listingId);
        if (traceRequired[listing.token]) revert TraceRequired(listing.token);
        _purchase(listing, listingId, amount);
    }

    /// @notice Buys a token marked `traceRequired`. `signature` is the trace signer's over `traceDigest`.
    /// The server produces that signature only after a Guardian trace of this token comes back backed.
    function buyTraced(
        uint256 listingId,
        uint64 amount,
        bytes32 recordHash,
        uint64 validUntil,
        bytes calldata signature
    ) external payable nonReentrant {
        Listing storage listing = _activeListing(listingId);
        if (!traceRequired[listing.token]) revert TraceNotRequired(listing.token);
        if (recordHash == bytes32(0)) revert EmptyTrace();
        if (block.timestamp > validUntil) revert TraceExpired(validUntil);
        address signer = ECDSA.recover(
            traceDigest(listingId, listing.token, listing.seller, amount, recordHash, validUntil),
            signature
        );
        if (signer != traceSigner) revert BadTrace(signer);
        _purchase(listing, listingId, amount);
    }

    /// @notice Hash the trace signer signs. Binds the checkout, the listing, the token, the seller, the amount and
    /// the Guardian record hash, and expires at `validUntil`.
    function traceDigest(
        uint256 listingId,
        address token,
        address seller,
        uint64 amount,
        bytes32 recordHash,
        uint64 validUntil
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    keccak256(
                        abi.encode(
                            block.chainid,
                            address(this),
                            listingId,
                            token,
                            seller,
                            amount,
                            recordHash,
                            validUntil
                        )
                    )
                )
            );
    }

    /// @notice The key whose signature `buyTraced` accepts.
    function setTraceSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (signer == address(0)) revert ZeroAddress();
        traceSigner = signer;
        emit TraceSignerSet(signer);
    }

    /// @notice Marks `token` so `buy` reverts and `buyTraced` is required. The signer must already be set.
    function setTraceRequired(address token, bool required) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (required && traceSigner == address(0)) revert ZeroAddress();
        traceRequired[token] = required;
        emit TraceRequiredSet(token, required);
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

    function _purchase(Listing storage listing, uint256 listingId, uint64 amount) private {
        uint256 cost = quote(listingId, amount);
        uint256 minOut = minUsdOut(listingId, amount);
        listing.available -= amount;
        if (listing.available == 0) listing.active = false;
        uint256 refund = _settle(listing.seller, cost, minOut);
        HederaTokenLib.transferFromSelf(listing.token, msg.sender, amount);
        emit Purchased(listingId, msg.sender, amount, cost);
        _sendNative(msg.sender, refund);
    }
}
