// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { HederaTokenLib } from "./lib/HederaTokenLib.sol";

/// @title HydroREC
/// @notice Registry for verified hydropower generation. Verifiers attest metered energy (with the full report
/// anchored on HCS), the contract mints Hedera Token Service RECs (1 token = 1 MWh), and holders can sell them
/// at a USD price settled in HBAR through a Chainlink HBAR/USD feed, or retire them permanently.
/// @dev RECs stay in the contract treasury and are tracked per account ("registry custody"), the same model
/// used by I-REC and Verra registries. Buyers therefore never need an HTS token association unless they
/// `withdraw` to their own wallet.
contract HydroREC is AccessControl, ReentrancyGuard {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint16 public constant MAX_BPS = 10_000;
    /// @notice 1 token = 1 MWh, so one base unit is 1 kWh.
    int32 public constant REC_DECIMALS = 3;
    uint256 public constant WH_PER_UNIT = 1_000;
    uint256 public constant MAX_BENEFICIARY_BYTES = 128;

    /// @notice Chainlink HBAR/USD feed used to convert USD listing prices into HBAR.
    AggregatorV3Interface public immutable HBAR_USD_FEED;
    /// @notice Native units per HBAR as seen by `msg.value`: 1e8 (tinybar) on Hedera, 1e18 on a local Hardhat EVM.
    uint256 public immutable NATIVE_UNITS_PER_HBAR;

    struct Plant {
        string name;
        address operator;
        uint32 capacityKw;
        bool active;
        uint64 lastPeriodEnd;
        uint64 carryWh;
        uint128 certifiedWh;
    }

    struct AttestationInput {
        bytes32 plantId;
        uint64 periodStart;
        uint64 periodEnd;
        uint64 energyWh;
        uint16 trustScoreBps;
        bytes32 reportHash;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
    }

    struct Attestation {
        bytes32 plantId;
        uint64 periodStart;
        uint64 periodEnd;
        uint64 energyWh;
        uint64 unitsMinted;
        uint16 trustScoreBps;
        bytes32 reportHash;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
        address verifier;
        uint64 timestamp;
    }

    struct Listing {
        address seller;
        uint64 unitsAvailable;
        uint64 priceUsdCentsPerMwh;
        bool active;
    }

    struct Retirement {
        address account;
        uint64 units;
        uint64 timestamp;
        string beneficiary;
        /// @dev Serial of the HTS NFT certificate, 0 when no certificate collection exists.
        uint64 certificateSerial;
        /// @dev False while the NFT waits in the treasury for the account to associate and `claimCertificate`.
        bool certificateDelivered;
    }

    address public recToken;
    /// @notice HTS NFT collection of retirement certificates (optional; created with `createCertificateToken`).
    address public certificateToken;
    uint16 public minTrustScoreBps;
    uint32 public maxPriceAge;

    uint256 public totalCertifiedWh;
    uint256 public totalRetiredUnits;
    uint256 public totalProceedsOwed;

    mapping(address account => uint256 units) public custodyBalanceOf;
    mapping(address seller => uint256 native) public proceedsOf;

    mapping(bytes32 plantId => Plant) private _plants;
    bytes32[] private _plantIds;
    Attestation[] private _attestations;
    Listing[] private _listings;
    Retirement[] private _retirements;

    event RecTokenCreated(address indexed token);
    event PlantRegistered(bytes32 indexed plantId, string name, address indexed operator, uint32 capacityKw);
    event PlantStatusChanged(bytes32 indexed plantId, bool active);
    event MinTrustScoreChanged(uint16 minTrustScoreBps);
    event MaxPriceAgeChanged(uint32 maxPriceAge);
    event AttestationSubmitted(
        uint256 indexed attestationId,
        bytes32 indexed plantId,
        uint64 energyWh,
        uint64 unitsMinted,
        uint16 trustScoreBps,
        bytes32 reportHash,
        uint64 hcsTopicNum,
        uint64 hcsSequence
    );
    event Withdrawn(address indexed account, uint256 units);
    event ListingCreated(uint256 indexed listingId, address indexed seller, uint64 units, uint64 priceUsdCentsPerMwh);
    event ListingCancelled(uint256 indexed listingId, uint64 unitsReturned);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint64 units, uint256 nativePaid);
    event Retired(uint256 indexed retirementId, address indexed account, uint64 units, string beneficiary);
    event CertificateTokenCreated(address indexed token);
    event CertificateIssued(uint256 indexed retirementId, uint64 serial, bool delivered);
    event CertificateClaimed(uint256 indexed retirementId, address indexed account, uint64 serial);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    error TokenAlreadyCreated();
    error TokenNotCreated();
    error InvalidPlant(bytes32 plantId);
    error PlantAlreadyRegistered(bytes32 plantId);
    error PlantInactive(bytes32 plantId);
    error InvalidPeriod(uint64 periodStart, uint64 periodEnd);
    error PeriodOverlapsPrevious(uint64 periodStart, uint64 lastPeriodEnd);
    error TrustScoreTooLow(uint16 trustScoreBps, uint16 minTrustScoreBps);
    error InvalidTrustScore(uint16 value);
    error EnergyExceedsCapacity(uint64 energyWh, uint256 maxEnergyWh);
    error EmptyReportHash();
    error ZeroAmount();
    error InsufficientCustody(uint256 requested, uint256 available);
    error InvalidListing(uint256 listingId);
    error NotSeller(uint256 listingId);
    error InsufficientListingUnits(uint64 requested, uint64 available);
    error InsufficientPayment(uint256 required, uint256 provided);
    error BeneficiaryTooLong();
    error InvalidPrice(int256 answer);
    error StalePrice(uint256 updatedAt, uint32 maxPriceAge);
    error NativeTransferFailed();
    error ZeroAddress();
    error NoCertificateToClaim(uint256 retirementId);
    error NotRetirementOwner(uint256 retirementId);

    /// @param admin Account granted DEFAULT_ADMIN_ROLE and VERIFIER_ROLE.
    /// @param hbarUsdFeed Chainlink HBAR/USD AggregatorV3 feed.
    /// @param nativeUnitsPerHbar 1e8 on Hedera networks, 1e18 on a local Hardhat EVM.
    /// @param minTrustScoreBps_ Minimum verifier trust score (basis points) required to mint.
    /// @param maxPriceAge_ Maximum age in seconds of the oracle answer used for settlement.
    constructor(
        address admin,
        AggregatorV3Interface hbarUsdFeed,
        uint256 nativeUnitsPerHbar,
        uint16 minTrustScoreBps_,
        uint32 maxPriceAge_
    ) {
        if (admin == address(0) || address(hbarUsdFeed) == address(0)) revert ZeroAddress();
        if (minTrustScoreBps_ > MAX_BPS) revert InvalidTrustScore(minTrustScoreBps_);

        HBAR_USD_FEED = hbarUsdFeed;
        NATIVE_UNITS_PER_HBAR = nativeUnitsPerHbar;
        minTrustScoreBps = minTrustScoreBps_;
        maxPriceAge = maxPriceAge_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Creates the HTS REC token with this contract as treasury, admin and supply key.
    /// @dev Send enough HBAR to cover the HTS token creation fee (see README).
    function createRecToken(
        string calldata name,
        string calldata symbol
    ) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        if (recToken != address(0)) revert TokenAlreadyCreated();
        recToken = HederaTokenLib.createContractOwnedToken(
            name,
            symbol,
            "Hydro dMRV renewable energy certificate. 1 token = 1 MWh.",
            REC_DECIMALS,
            msg.value
        );
        emit RecTokenCreated(recToken);
    }

    /// @notice Creates the HTS NFT collection used for retirement certificates. Each retirement then mints one NFT
    /// with metadata `hydro-dmrv:retirement:<retirementId>`; the collection belongs to exactly one registry, so the
    /// pair (certificate token, retirement id) identifies the record.
    function createCertificateToken(
        string calldata name,
        string calldata symbol
    ) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        if (certificateToken != address(0)) revert TokenAlreadyCreated();
        certificateToken = HederaTokenLib.createContractOwnedNft(
            name,
            symbol,
            "Hydro dMRV retirement certificates. Each NFT proves RECs were permanently retired.",
            msg.value
        );
        emit CertificateTokenCreated(certificateToken);
    }

    function registerPlant(
        bytes32 plantId,
        string calldata name,
        address operator,
        uint32 capacityKw
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (plantId == bytes32(0) || operator == address(0) || capacityKw == 0) revert InvalidPlant(plantId);
        if (_plants[plantId].operator != address(0)) revert PlantAlreadyRegistered(plantId);

        Plant storage plant = _plants[plantId];
        plant.name = name;
        plant.operator = operator;
        plant.capacityKw = capacityKw;
        plant.active = true;
        _plantIds.push(plantId);

        emit PlantRegistered(plantId, name, operator, capacityKw);
    }

    function setPlantActive(bytes32 plantId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_plants[plantId].operator == address(0)) revert InvalidPlant(plantId);
        _plants[plantId].active = active;
        emit PlantStatusChanged(plantId, active);
    }

    function setMinTrustScore(uint16 minTrustScoreBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (minTrustScoreBps_ > MAX_BPS) revert InvalidTrustScore(minTrustScoreBps_);
        minTrustScoreBps = minTrustScoreBps_;
        emit MinTrustScoreChanged(minTrustScoreBps_);
    }

    function setMaxPriceAge(uint32 maxPriceAge_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPriceAge = maxPriceAge_;
        emit MaxPriceAgeChanged(maxPriceAge_);
    }

    /// @notice Recovers HBAR that is not owed to sellers (e.g. change from the HTS creation fee).
    function sweepHbar(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        _sendNative(to, address(this).balance - totalProceedsOwed);
    }

    // ─── Verification ────────────────────────────────────────────────────────

    /// @notice Records a verified generation period and mints RECs into the plant operator's custody balance.
    /// @dev The off-chain verifier runs the 5-layer checks and publishes the report to HCS first; `reportHash`
    /// is the SHA-256 of that HCS message so anyone can prove the on-chain record matches the published report.
    /// The contract independently enforces the capacity ceiling, period continuity and the trust threshold.
    function submitAttestation(
        AttestationInput calldata input
    ) external onlyRole(VERIFIER_ROLE) nonReentrant returns (uint256 attestationId) {
        address token = recToken;
        if (token == address(0)) revert TokenNotCreated();

        Plant storage plant = _plants[input.plantId];
        if (plant.operator == address(0)) revert InvalidPlant(input.plantId);
        if (!plant.active) revert PlantInactive(input.plantId);
        if (input.periodEnd <= input.periodStart || input.periodEnd > block.timestamp) {
            revert InvalidPeriod(input.periodStart, input.periodEnd);
        }
        if (input.periodStart < plant.lastPeriodEnd) {
            revert PeriodOverlapsPrevious(input.periodStart, plant.lastPeriodEnd);
        }
        if (input.trustScoreBps > MAX_BPS) revert InvalidTrustScore(input.trustScoreBps);
        if (input.trustScoreBps < minTrustScoreBps) revert TrustScoreTooLow(input.trustScoreBps, minTrustScoreBps);
        if (input.reportHash == bytes32(0)) revert EmptyReportHash();

        uint256 maxEnergyWh = (uint256(plant.capacityKw) * (input.periodEnd - input.periodStart) * 1_000) / 3_600;
        if (input.energyWh > maxEnergyWh) revert EnergyExceedsCapacity(input.energyWh, maxEnergyWh);

        uint256 totalWh = uint256(input.energyWh) + plant.carryWh;
        uint64 units = uint64(totalWh / WH_PER_UNIT);

        plant.carryWh = uint64(totalWh % WH_PER_UNIT);
        plant.lastPeriodEnd = input.periodEnd;
        plant.certifiedWh += input.energyWh;
        totalCertifiedWh += input.energyWh;

        attestationId = _attestations.length;
        _attestations.push(
            Attestation({
                plantId: input.plantId,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                energyWh: input.energyWh,
                unitsMinted: units,
                trustScoreBps: input.trustScoreBps,
                reportHash: input.reportHash,
                hcsTopicNum: input.hcsTopicNum,
                hcsSequence: input.hcsSequence,
                verifier: msg.sender,
                timestamp: uint64(block.timestamp)
            })
        );

        if (units > 0) {
            custodyBalanceOf[plant.operator] += units;
            HederaTokenLib.mint(token, units);
        }

        emit AttestationSubmitted(
            attestationId,
            input.plantId,
            input.energyWh,
            units,
            input.trustScoreBps,
            input.reportHash,
            input.hcsTopicNum,
            input.hcsSequence
        );
    }

    // ─── Custody ─────────────────────────────────────────────────────────────

    /// @notice Moves RECs from registry custody to the caller's wallet. The caller must be associated with the
    /// HTS token first (HIP-719: call `associate()` on the token address, or use auto-association slots).
    function withdraw(uint256 units) external nonReentrant {
        _debitCustody(msg.sender, units);
        HederaTokenLib.transferFromSelf(recToken, msg.sender, units);
        emit Withdrawn(msg.sender, units);
    }

    /// @notice Permanently retires RECs from the caller's custody balance by burning them on HTS.
    function retire(uint64 units, string calldata beneficiary) external nonReentrant returns (uint256 retirementId) {
        return _retire(msg.sender, units, beneficiary);
    }

    /// @notice Delivers a certificate NFT that could not be sent at retirement time. Associate the certificate
    /// token first (HIP-719 `associate()` on its address).
    function claimCertificate(uint256 retirementId) external nonReentrant {
        Retirement storage retirement = _retirements[retirementId];
        if (retirement.account != msg.sender) revert NotRetirementOwner(retirementId);
        if (retirement.certificateSerial == 0 || retirement.certificateDelivered) {
            revert NoCertificateToClaim(retirementId);
        }
        retirement.certificateDelivered = true;
        HederaTokenLib.transferNftFromSelf(certificateToken, msg.sender, retirement.certificateSerial);
        emit CertificateClaimed(retirementId, msg.sender, retirement.certificateSerial);
    }

    // ─── Marketplace ─────────────────────────────────────────────────────────

    function createListing(uint64 units, uint64 priceUsdCentsPerMwh) external nonReentrant returns (uint256 listingId) {
        if (priceUsdCentsPerMwh == 0) revert ZeroAmount();
        _debitCustody(msg.sender, units);

        listingId = _listings.length;
        _listings.push(
            Listing({
                seller: msg.sender,
                unitsAvailable: units,
                priceUsdCentsPerMwh: priceUsdCentsPerMwh,
                active: true
            })
        );
        emit ListingCreated(listingId, msg.sender, units, priceUsdCentsPerMwh);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _activeListing(listingId);
        if (listing.seller != msg.sender) revert NotSeller(listingId);

        uint64 remaining = listing.unitsAvailable;
        listing.unitsAvailable = 0;
        listing.active = false;
        custodyBalanceOf[msg.sender] += remaining;

        emit ListingCancelled(listingId, remaining);
    }

    /// @notice Buys `units` (kWh) from a listing into the caller's custody balance. Excess payment is refunded.
    function buy(uint256 listingId, uint64 units) external payable nonReentrant {
        uint256 refund = _purchase(listingId, units);
        custodyBalanceOf[msg.sender] += units;
        _sendNative(msg.sender, refund);
    }

    /// @notice Buys `units` from a listing and retires them in the same transaction.
    function buyAndRetire(
        uint256 listingId,
        uint64 units,
        string calldata beneficiary
    ) external payable nonReentrant returns (uint256 retirementId) {
        uint256 refund = _purchase(listingId, units);
        custodyBalanceOf[msg.sender] += units;
        retirementId = _retire(msg.sender, units, beneficiary);
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

    /// @notice Native amount (tinybar on Hedera) required to buy `units` kWh from `listingId` at the oracle price.
    function quote(uint256 listingId, uint64 units) public view returns (uint256 nativeCost) {
        Listing storage listing = _activeListing(listingId);
        if (units == 0) revert ZeroAmount();
        if (units > listing.unitsAvailable) revert InsufficientListingUnits(units, listing.unitsAvailable);
        return usdCentsPerMwhToNative(listing.priceUsdCentsPerMwh, units);
    }

    /// @notice Converts a USD price per MWh into the native amount for `units` kWh, rounding up.
    function usdCentsPerMwhToNative(uint64 priceUsdCentsPerMwh, uint64 units) public view returns (uint256) {
        (uint256 answer, uint8 feedDecimals) = _freshHbarUsd();
        // cost(USD) = price/100 * units/1000 ; HBAR = USD / (answer / 10^d) ; native = HBAR * NATIVE_UNITS_PER_HBAR
        uint256 numerator = uint256(priceUsdCentsPerMwh) * units * (10 ** feedDecimals) * NATIVE_UNITS_PER_HBAR;
        uint256 denominator = 100 * WH_PER_UNIT * answer;
        return (numerator + denominator - 1) / denominator;
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getPlant(bytes32 plantId) external view returns (Plant memory) {
        return _plants[plantId];
    }

    function getPlantIds() external view returns (bytes32[] memory) {
        return _plantIds;
    }

    function attestationCount() external view returns (uint256) {
        return _attestations.length;
    }

    function getAttestation(uint256 attestationId) external view returns (Attestation memory) {
        return _attestations[attestationId];
    }

    function getAttestations(uint256 start, uint256 count) external view returns (Attestation[] memory page) {
        uint256 end = _pageEnd(start, count, _attestations.length);
        page = new Attestation[](end - start);
        for (uint256 i = start; i < end; i++) page[i - start] = _attestations[i];
    }

    function listingCount() external view returns (uint256) {
        return _listings.length;
    }

    function getListings(uint256 start, uint256 count) external view returns (Listing[] memory page) {
        uint256 end = _pageEnd(start, count, _listings.length);
        page = new Listing[](end - start);
        for (uint256 i = start; i < end; i++) page[i - start] = _listings[i];
    }

    function retirementCount() external view returns (uint256) {
        return _retirements.length;
    }

    function getRetirement(uint256 retirementId) external view returns (Retirement memory) {
        return _retirements[retirementId];
    }

    function getRetirements(uint256 start, uint256 count) external view returns (Retirement[] memory page) {
        uint256 end = _pageEnd(start, count, _retirements.length);
        page = new Retirement[](end - start);
        for (uint256 i = start; i < end; i++) page[i - start] = _retirements[i];
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

    function _retire(
        address account,
        uint64 units,
        string calldata beneficiary
    ) private returns (uint256 retirementId) {
        if (bytes(beneficiary).length > MAX_BENEFICIARY_BYTES) revert BeneficiaryTooLong();
        _debitCustody(account, units);
        totalRetiredUnits += units;

        retirementId = _retirements.length;
        Retirement storage retirement = _retirements.push();
        retirement.account = account;
        retirement.units = units;
        retirement.timestamp = uint64(block.timestamp);
        retirement.beneficiary = beneficiary;

        HederaTokenLib.burn(recToken, units);
        emit Retired(retirementId, account, units, beneficiary);

        if (certificateToken != address(0)) _issueCertificate(retirement, retirementId);
    }

    /// @dev Delivery is best-effort so a retirement never fails because the wallet cannot yet hold the NFT.
    function _issueCertificate(Retirement storage retirement, uint256 retirementId) private {
        bytes memory metadata = abi.encodePacked("hydro-dmrv:retirement:", _toDecimal(retirementId));
        uint64 serial = HederaTokenLib.mintNft(certificateToken, metadata);
        bool delivered = HederaTokenLib.tryTransferNftFromSelf(certificateToken, retirement.account, serial);
        retirement.certificateSerial = serial;
        retirement.certificateDelivered = delivered;
        emit CertificateIssued(retirementId, serial, delivered);
    }

    function _debitCustody(address account, uint256 units) private {
        if (units == 0) revert ZeroAmount();
        uint256 available = custodyBalanceOf[account];
        if (units > available) revert InsufficientCustody(units, available);
        custodyBalanceOf[account] = available - units;
    }

    function _activeListing(uint256 listingId) private view returns (Listing storage listing) {
        if (listingId >= _listings.length) revert InvalidListing(listingId);
        listing = _listings[listingId];
        if (!listing.active) revert InvalidListing(listingId);
    }

    function _freshHbarUsd() private view returns (uint256 answer, uint8 decimals) {
        (uint80 roundId, int256 rawAnswer, , uint256 updatedAt, uint80 answeredInRound) = HBAR_USD_FEED
            .latestRoundData();
        if (rawAnswer <= 0 || updatedAt == 0 || answeredInRound < roundId) revert InvalidPrice(rawAnswer);
        if (block.timestamp - updatedAt > maxPriceAge) revert StalePrice(updatedAt, maxPriceAge);
        return (uint256(rawAnswer), HBAR_USD_FEED.decimals());
    }

    function _sendNative(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{ value: amount }("");
        if (!ok) revert NativeTransferFailed();
    }

    function _toDecimal(uint256 value) private pure returns (bytes memory digits) {
        if (value == 0) return "0";
        uint256 length;
        for (uint256 v = value; v != 0; v /= 10) length++;
        digits = new bytes(length);
        for (; value != 0; value /= 10) digits[--length] = bytes1(uint8(48 + (value % 10)));
    }

    function _pageEnd(uint256 start, uint256 count, uint256 length) private pure returns (uint256) {
        if (start >= length) return start;
        uint256 end = start + count;
        return end > length ? length : end;
    }
}
