// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { AggregatorV3Interface } from "./interfaces/AggregatorV3Interface.sol";
import { HederaTokenLib } from "./lib/HederaTokenLib.sol";

/// @title HydroCreditRegistry
/// @notice Carbon-credit registry for grid-connected hydropower under CDM ACM0002 (large scale) and AMS-I.D
/// (small scale), or Verra VMR0017 v1.0 applied with ACM0002 v22.0. Each plant is registered with its methodology
/// and validated design: project type, reservoir areas, the ex-ante
/// TOOL07 grid emission factor, the TOOL03 fuel coefficient, the retrofit baseline and the crediting period.
/// Verifiers attest monitored quantities for a period, with the full report and raw readings anchored on HCS.
/// Each period carries a statement signed by the plant's registered meter; the verifier's figures may only be more
/// conservative than what the meter signed, so a verifier key alone cannot mint. The contract itself computes
///
///     ER_y = BE_y − PE_y − LE_y,   BE_y = EG_PJ,y × EF_grid,CM,y,   PE_y = PE_FF,y + PE_HP,y
///
/// where VMR0017 raises EF_Res to 100 kg CO2e/MWh and adds embodied emissions to LE_y (§8.3, §9.1).
///
/// and mints Hedera Token Service credits (1 token = 1 t CO2e, 1 base unit = 1 kg CO2e). Credits are sold at a USD
/// price settled in HBAR through an HBAR/USD feed, or retired with an HTS NFT certificate.
/// @dev Credits stay in the contract treasury and are tracked per account ("registry custody"), the model used by
/// Verra and Gold Standard registries, so buyers never need an HTS association unless they `withdraw`.
/// The TypeScript mirror of the quantification is `packages/nextjs/services/mrv/methodology/quantify.ts`; both
/// round baseline emissions down and project emissions up, so every rounding favours the atmosphere.
contract HydroCreditRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint16 public constant MAX_BPS = 10_000;
    /// @notice 1 token = 1 t CO2e, so one base unit is 1 kg CO2e.
    int32 public constant CREDIT_DECIMALS = 3;
    uint256 public constant UNITS_PER_CREDIT = 1_000;
    uint256 public constant G_PER_UNIT = 1_000;
    uint256 public constant MAX_BENEFICIARY_BYTES = 128;

    /// @notice Crediting-period years are 365-day blocks counted from the crediting start.
    uint256 public constant CREDITING_YEAR = 365 days;
    uint256 public constant MAX_CREDITING_YEARS = 10;
    /// @notice VCS Standard v5.0 Table 8: E&I registrations from this instant use a 5-year crediting period.
    uint64 public constant VCS_FIVE_YEAR_FROM = 1_798_761_600;
    /// @notice EF_Res, the default emission factor for reservoir emissions: 90 kg CO2e/MWh (ACM0002 / AMS-I.D).
    uint32 public constant RESERVOIR_EF_G_PER_MWH = 90_000;
    /// @notice VMR0017 §9.1: EF_Res = 100 kg CO2e/MWh.
    uint32 public constant VMR0017_RESERVOIR_EF_G_PER_MWH = 100_000;
    /// @notice VMR0017 §9.1: EF_embodied for hydropower, 21 g CO2e/kWh.
    uint32 public constant VMR0017_EMBODIED_HYDRO_G_PER_MWH = 21_000;
    /// @notice VMR0017 Table 1: hydroelectric project activities of 15 MW or less.
    uint32 public constant VMR0017_MAX_HYDRO_KW = 15_000;
    /// @notice Reservoir power density thresholds in W/m².
    uint256 public constant MIN_POWER_DENSITY = 4;
    uint256 public constant RESERVOIR_EMISSIONS_POWER_DENSITY = 10;
    /// @notice Sanity ceiling for a grid emission factor (2 t CO2/MWh is above any real grid's combined margin).
    uint32 public constant MAX_GRID_EF_G_PER_MWH = 2_000_000;
    /// @notice The admin cannot switch the settlement staleness check off. Two days covers a missed heartbeat.
    uint32 public constant MAX_PRICE_AGE = 2 * 24 * 60 * 60;
    uint256 private constant WH_PER_MWH = 1e6;
    uint256 private constant G_PER_TONNE = 1e6;
    /// @notice Domain tag of the meter statement; the signed hash also binds the chain id and this registry.
    bytes32 public constant METER_STATEMENT_TAG = keccak256("hydro-dmrv/meter-statement@1");

    /// @notice HBAR/USD feed used to convert USD listing prices into HBAR.
    AggregatorV3Interface public immutable HBAR_USD_FEED;
    /// @notice Native units per HBAR as seen by `msg.value`: 1e8 (tinybar) on Hedera, 1e18 on a local Hardhat EVM.
    uint256 public immutable NATIVE_UNITS_PER_HBAR;

    enum ProjectType {
        Greenfield,
        Retrofit,
        CapacityAddition
    }

    /// @notice Rule set applied to a plant: CDM ACM0002 / AMS-I.D, or Verra VMR0017 v1.0 with ACM0002 v22.0.
    enum Methodology {
        Cdm,
        Vmr0017
    }

    /// @notice The validated, ex-ante parameters of a plant. `designHash` commits to the full design document
    /// (TOOL07 dataset, historical generation, hydraulics) from which these integers were derived.
    struct PlantDesign {
        ProjectType projectType;
        Methodology methodology;
        /// @dev Cap_PJ and Cap_BL in kW.
        uint32 capacityKw;
        uint32 baselineCapacityKw;
        /// @dev A_PJ and A_BL: full-reservoir water surface in m² (0 for run-of-river).
        uint64 reservoirAreaM2;
        uint64 baselineReservoirAreaM2;
        /// @dev EF_grid,CM from TOOL07 (ex-ante, fixed for the crediting period) in g CO2/MWh, rounded down.
        uint32 efGridGPerMwh;
        /// @dev TOOL03 COEF of the fuel burnt on site in g CO2 per tonne of fuel, rounded up (0 = no fuel).
        uint32 fuelCoefGPerTonne;
        /// @dev EG_historical + σ_historical in Wh per crediting year (retrofit / capacity addition only).
        uint64 baselineWh;
        /// @dev DATE_BaselineRetrofit (unix seconds); later periods credit nothing. 0 for greenfield plants.
        uint64 baselineEndsAt;
        uint64 creditingStart;
        uint64 creditingEnd;
        bytes32 designHash;
    }

    struct Plant {
        string name;
        address operator;
        /// @dev Key of the plant's data logger; every attestation must carry its signature over the raw totals.
        address meter;
        bool active;
        PlantDesign design;
        /// @dev PE_HP rate derived from the power density and methodology at registration: 0 or EF_Res.
        uint32 reservoirGPerMwh;
        /// @dev EF_embodied for LE_y: VMR0017_EMBODIED_HYDRO_G_PER_MWH under VMR0017, 0 under the CDM.
        uint32 embodiedGPerMwh;
        /// @dev Ledger: attestation count, current crediting year and its accumulated EG_facility.
        uint32 attestations;
        uint32 creditingYear;
        int128 yearNetWh;
        /// @dev Unissued emission reductions in g: a sub-kg remainder, or a deficit carried forward when negative.
        int128 balanceG;
        uint64 lastPeriodEnd;
        int128 totalNetWh;
        uint128 issuedUnits;
        /// @dev 1 when the plant is registered. A 10-year period is fixed. A 5- or 7-year period renews at most twice.
        uint8 creditingPeriods;
    }

    /// @notice What the plant's meter signed for the period: raw totals, before any QA/QC, and the SHA-256 of the
    /// readings batch published on HCS. `signature` is an EIP-191 signature over `meterStatementHash`.
    struct MeterStatement {
        uint64 grossEnergyWh;
        int64 netEnergyWh;
        uint64 fuelG;
        bytes32 readingsDigest;
        bytes signature;
    }

    struct AttestationInput {
        bytes32 plantId;
        /// @dev The plant's attestation count the report was computed against; guards against a stale ledger.
        uint32 plantSequence;
        uint64 periodStart;
        uint64 periodEnd;
        /// @dev EG_facility: net electricity supplied to the grid (export − import) after QA/QC. May be negative.
        int64 netEnergyWh;
        /// @dev TEG: gross generation at the generator terminals.
        uint64 grossEnergyWh;
        /// @dev FC: fossil fuel burnt on site, in grams.
        uint64 fuelG;
        /// @dev Leakage assessed outside the methodology's equations, normally zero. VMR0017 embodied emissions
        /// are computed here and added to it.
        uint64 leakageG;
        uint16 completenessBps;
        bytes32 reportHash;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
        MeterStatement meter;
    }

    struct Attestation {
        bytes32 plantId;
        uint64 periodStart;
        uint64 periodEnd;
        int64 netEnergyWh;
        uint64 grossEnergyWh;
        uint64 fuelG;
        /// @dev EG_PJ,y, BE_y, PE_HP,y, PE_FF,y, LE_y and ER_y exactly as computed here.
        int64 projectEnergyWh;
        int64 baselineG;
        uint64 reservoirG;
        uint64 fossilFuelG;
        uint64 leakageG;
        int64 reductionG;
        uint64 unitsMinted;
        uint16 completenessBps;
        bytes32 reportHash;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
        address verifier;
        uint64 timestamp;
    }

    struct Listing {
        address seller;
        uint64 unitsAvailable;
        uint64 priceUsdCentsPerTonne;
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

    struct Quantification {
        uint32 creditingYear;
        int256 yearNetWh;
        int256 projectEnergyWh;
        int256 baselineG;
        uint256 reservoirG;
        uint256 fossilFuelG;
        /// @dev LE_y: the input leakage plus VMR0017 embodied emissions.
        uint256 leakageG;
        int256 reductionG;
        uint256 units;
        int256 balanceG;
    }

    address public creditToken;
    /// @notice HTS NFT collection of retirement certificates (optional; created with `createCertificateToken`).
    address public certificateToken;
    uint16 public minCompletenessBps;
    uint32 public maxPriceAge;

    uint256 public totalIssuedUnits;
    uint256 public totalRetiredUnits;
    uint256 public totalProceedsOwed;

    mapping(address account => uint256 units) public custodyBalanceOf;
    mapping(address seller => uint256 native) public proceedsOf;

    mapping(bytes32 plantId => Plant) private _plants;
    /// @dev A meter key and a design hash each belong to one plant. Stops the same generation being registered twice.
    mapping(address meter => bytes32 plantId) public plantOfMeter;
    mapping(bytes32 designHash => bytes32 plantId) public plantOfDesign;
    /// @dev HCS topic attestations must use. Zero until the admin sets it; submission reverts until then.
    uint64 public auditTopic;
    bytes32[] private _plantIds;
    Attestation[] private _attestations;
    Listing[] private _listings;
    Retirement[] private _retirements;

    event CreditTokenCreated(address indexed token);
    event PlantRegistered(
        bytes32 indexed plantId,
        string name,
        address indexed operator,
        uint32 capacityKw,
        uint32 efGridGPerMwh,
        uint32 reservoirGPerMwh,
        bytes32 designHash
    );
    event CreditingPeriodRenewed(
        bytes32 indexed plantId,
        uint32 efGridGPerMwh,
        uint64 creditingStart,
        uint64 creditingEnd,
        bytes32 designHash
    );
    event PlantStatusChanged(bytes32 indexed plantId, bool active);
    event PlantMeterChanged(bytes32 indexed plantId, address indexed meter);
    event MeterStatementAccepted(uint256 indexed attestationId, address indexed meter, bytes32 readingsDigest);
    event MinCompletenessChanged(uint16 minCompletenessBps);
    event MaxPriceAgeChanged(uint32 maxPriceAge);
    event AuditTopicSet(uint64 topic);
    event AttestationSubmitted(
        uint256 indexed attestationId,
        bytes32 indexed plantId,
        int256 projectEnergyWh,
        int256 reductionG,
        uint256 unitsMinted,
        bytes32 reportHash,
        uint64 hcsTopicNum,
        uint64 hcsSequence
    );
    event Withdrawn(address indexed account, uint256 units);
    event ListingCreated(uint256 indexed listingId, address indexed seller, uint64 units, uint64 priceUsdCentsPerTonne);
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
    error InvalidCreditingPeriod(uint64 creditingStart, uint64 creditingEnd);
    error GridEmissionFactorOutOfRange(uint32 efGridGPerMwh);
    error InvalidBaseline(ProjectType projectType);
    error ReservoirBelowBaseline(uint64 reservoirAreaM2, uint64 baselineReservoirAreaM2);
    error PowerDensityTooLow(uint256 addedCapacityW, uint256 addedAreaM2);
    error MethodologyNotApplicable(Methodology methodology, uint32 capacityKw);
    error InvalidPeriod(uint64 periodStart, uint64 periodEnd);
    error PeriodOverlapsPrevious(uint64 periodStart, uint64 lastPeriodEnd);
    error OutsideCreditingPeriod(uint64 periodStart, uint64 periodEnd);
    error PeriodCrossesCreditingYear(uint64 periodStart, uint64 periodEnd);
    error StaleLedger(uint32 expected, uint32 provided);
    error CompletenessTooLow(uint16 completenessBps, uint16 minCompletenessBps);
    error InvalidCompleteness(uint16 value);
    error EnergyExceedsCapacity(uint64 grossEnergyWh, uint256 maxEnergyWh);
    error NetExceedsGross(int64 netEnergyWh, uint64 grossEnergyWh);
    error FuelNotRegistered();
    error EmptyReportHash();
    error InvalidMeterSignature(address signer, address meter);
    error NotMetered(uint64 grossEnergyWh, int64 netEnergyWh, uint64 fuelG);
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
    error MeterAlreadyRegistered(address meter);
    error DesignAlreadyRegistered(bytes32 designHash);
    error EmptyDesignHash();
    error Unanchored(uint64 topic, uint64 sequence);
    error PriceAgeOutOfRange(uint32 maxPriceAge);

    /// @param admin Account granted DEFAULT_ADMIN_ROLE and VERIFIER_ROLE.
    /// @param hbarUsdFeed HBAR/USD AggregatorV3 feed (e.g. `ResilientHbarUsdFeed`).
    /// @param nativeUnitsPerHbar 1e8 on Hedera networks, 1e18 on a local Hardhat EVM.
    /// @param minCompletenessBps_ Minimum share of a period covered by accepted monitoring data.
    /// @param maxPriceAge_ Maximum age in seconds of the oracle answer used for settlement.
    constructor(
        address admin,
        AggregatorV3Interface hbarUsdFeed,
        uint256 nativeUnitsPerHbar,
        uint16 minCompletenessBps_,
        uint32 maxPriceAge_
    ) {
        if (admin == address(0) || address(hbarUsdFeed) == address(0)) revert ZeroAddress();
        if (minCompletenessBps_ > MAX_BPS) revert InvalidCompleteness(minCompletenessBps_);
        if (maxPriceAge_ == 0 || maxPriceAge_ > MAX_PRICE_AGE) revert PriceAgeOutOfRange(maxPriceAge_);

        HBAR_USD_FEED = hbarUsdFeed;
        NATIVE_UNITS_PER_HBAR = nativeUnitsPerHbar;
        minCompletenessBps = minCompletenessBps_;
        maxPriceAge = maxPriceAge_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Creates the HTS credit token with this contract as treasury, admin and supply key.
    /// @dev Send enough HBAR to cover the HTS token creation fee (see README).
    function createCreditToken(
        string calldata name,
        string calldata symbol
    ) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        if (creditToken != address(0)) revert TokenAlreadyCreated();
        creditToken = HederaTokenLib.createContractOwnedToken(
            name,
            symbol,
            "Hydro dMRV emission reductions (ACM0002 / AMS-I.D). 1 token = 1 t CO2e.",
            CREDIT_DECIMALS,
            msg.value
        );
        emit CreditTokenCreated(creditToken);
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
            "Hydro dMRV retirement certificates. Each NFT proves credits were permanently retired.",
            msg.value
        );
        emit CertificateTokenCreated(certificateToken);
    }

    /// @notice Registers a plant with its validated design. Reverts when the design fails an applicability
    /// condition the contract can check: the reservoir power density rule, the baseline scenario for the project
    /// type, the crediting period length and the grid emission factor range.
    function registerPlant(
        bytes32 plantId,
        string calldata name,
        address operator,
        address meter,
        PlantDesign calldata design
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (plantId == bytes32(0) || operator == address(0)) revert InvalidPlant(plantId);
        if (meter == address(0)) revert ZeroAddress();
        if (_plants[plantId].operator != address(0)) revert PlantAlreadyRegistered(plantId);
        uint32 reservoirRate = _validateDesign(design);
        _claimDesign(plantId, design.designHash);
        _claimMeter(plantId, meter);

        Plant storage plant = _plants[plantId];
        plant.name = name;
        plant.operator = operator;
        plant.meter = meter;
        plant.active = true;
        plant.design = design;
        plant.reservoirGPerMwh = reservoirRate;
        plant.embodiedGPerMwh = design.methodology == Methodology.Vmr0017 ? VMR0017_EMBODIED_HYDRO_G_PER_MWH : 0;
        plant.creditingPeriods = 1;
        _plantIds.push(plantId);

        emit PlantRegistered(
            plantId,
            name,
            operator,
            design.capacityKw,
            design.efGridGPerMwh,
            reservoirRate,
            design.designHash
        );
        emit PlantMeterChanged(plantId, meter);
    }

    /// @notice Replaces a plant's meter key, e.g. after the data logger is swapped and re-validated on site.
    function setPlantMeter(bytes32 plantId, address meter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (meter == address(0)) revert ZeroAddress();
        Plant storage plant = _existingPlant(plantId);
        if (meter != plant.meter) {
            _claimMeter(plantId, meter);
            plantOfMeter[plant.meter] = bytes32(0);
            plant.meter = meter;
        }
        emit PlantMeterChanged(plantId, meter);
    }

    /// @notice Starts a renewed crediting period with an updated grid emission factor (TOOL07 requires the BM to
    /// be updated and the weights to change at renewal). Any deficit carries over; the crediting-year count restarts.
    function renewCreditingPeriod(
        bytes32 plantId,
        uint32 efGridGPerMwh,
        uint64 creditingStart,
        uint64 creditingEnd,
        bytes32 designHash
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Plant storage plant = _existingPlant(plantId);
        if (creditingStart < plant.design.creditingEnd) revert InvalidCreditingPeriod(creditingStart, creditingEnd);
        uint256 previous = uint256(plant.design.creditingEnd) - plant.design.creditingStart;
        if (previous == 10 * CREDITING_YEAR || plant.creditingPeriods >= 3) {
            revert InvalidCreditingPeriod(creditingStart, creditingEnd);
        }
        _validateCrediting(plant.design.methodology, creditingStart, creditingEnd);
        if (efGridGPerMwh == 0 || efGridGPerMwh > MAX_GRID_EF_G_PER_MWH) {
            revert GridEmissionFactorOutOfRange(efGridGPerMwh);
        }
        if (designHash != plant.design.designHash) _claimDesign(plantId, designHash);

        plant.design.efGridGPerMwh = efGridGPerMwh;
        plant.design.creditingStart = creditingStart;
        plant.design.creditingEnd = creditingEnd;
        plant.creditingPeriods += 1;
        bytes32 previousHash = plant.design.designHash;
        plant.design.designHash = designHash;
        if (previousHash != designHash) plantOfDesign[previousHash] = bytes32(0);
        plant.creditingYear = 0;
        plant.yearNetWh = 0;
        emit CreditingPeriodRenewed(plantId, efGridGPerMwh, creditingStart, creditingEnd, designHash);
    }

    function setPlantActive(bytes32 plantId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _existingPlant(plantId).active = active;
        emit PlantStatusChanged(plantId, active);
    }

    function setMinCompleteness(uint16 minCompletenessBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (minCompletenessBps_ > MAX_BPS) revert InvalidCompleteness(minCompletenessBps_);
        minCompletenessBps = minCompletenessBps_;
        emit MinCompletenessChanged(minCompletenessBps_);
    }

    function setMaxPriceAge(uint32 maxPriceAge_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (maxPriceAge_ == 0 || maxPriceAge_ > MAX_PRICE_AGE) revert PriceAgeOutOfRange(maxPriceAge_);
        maxPriceAge = maxPriceAge_;
        emit MaxPriceAgeChanged(maxPriceAge_);
    }

    /// @notice Fixes the HCS topic every later attestation must cite. It cannot be cleared.
    function setAuditTopic(uint64 topic) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (topic == 0) revert Unanchored(0, 0);
        auditTopic = topic;
        emit AuditTopicSet(topic);
    }

    /// @notice Recovers HBAR that is not owed to sellers (e.g. change from the HTS creation fee).
    function sweepHbar(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        _sendNative(to, address(this).balance - totalProceedsOwed);
    }

    // ─── Verification ────────────────────────────────────────────────────────

    /// @notice Records a verified monitoring period, computes its emission reductions from the registered design
    /// and mints the resulting credits into the plant operator's custody balance.
    /// @dev The off-chain engine publishes the readings and then the report to HCS; `reportHash` is the SHA-256 of
    /// the report message, whose figures must equal the ones computed and stored here.
    function submitAttestation(
        AttestationInput calldata input
    ) external onlyRole(VERIFIER_ROLE) nonReentrant returns (uint256 attestationId) {
        address token = creditToken;
        if (token == address(0)) revert TokenNotCreated();
        Plant storage plant = _existingPlant(input.plantId);
        _checkAttestation(plant, input);

        Quantification memory q = quantify(input.plantId, input);

        plant.attestations += 1;
        plant.creditingYear = q.creditingYear;
        plant.yearNetWh = int128(q.yearNetWh);
        plant.balanceG = int128(q.balanceG);
        plant.lastPeriodEnd = input.periodEnd;
        plant.totalNetWh += input.netEnergyWh;
        plant.issuedUnits += uint128(q.units);
        totalIssuedUnits += q.units;

        attestationId = _attestations.length;
        Attestation storage record = _attestations.push();
        record.plantId = input.plantId;
        record.periodStart = input.periodStart;
        record.periodEnd = input.periodEnd;
        record.netEnergyWh = input.netEnergyWh;
        record.grossEnergyWh = input.grossEnergyWh;
        record.fuelG = input.fuelG;
        record.projectEnergyWh = int64(q.projectEnergyWh);
        record.baselineG = int64(q.baselineG);
        record.reservoirG = uint64(q.reservoirG);
        record.fossilFuelG = uint64(q.fossilFuelG);
        record.leakageG = uint64(q.leakageG);
        record.reductionG = int64(q.reductionG);
        record.unitsMinted = uint64(q.units);
        record.completenessBps = input.completenessBps;
        record.reportHash = input.reportHash;
        record.hcsTopicNum = input.hcsTopicNum;
        record.hcsSequence = input.hcsSequence;
        record.verifier = msg.sender;
        record.timestamp = uint64(block.timestamp);

        if (q.units > 0) {
            custodyBalanceOf[plant.operator] += q.units;
            HederaTokenLib.mint(token, q.units);
        }

        emit AttestationSubmitted(
            attestationId,
            input.plantId,
            q.projectEnergyWh,
            q.reductionG,
            q.units,
            input.reportHash,
            input.hcsTopicNum,
            input.hcsSequence
        );
        emit MeterStatementAccepted(attestationId, plant.meter, input.meter.readingsDigest);
    }

    /// @notice The hash the plant's meter signs (EIP-191 `personal_sign` over these 32 bytes) for a period.
    function meterStatementHash(bytes32 plantId, AttestationInput calldata input) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    METER_STATEMENT_TAG,
                    block.chainid,
                    address(this),
                    plantId,
                    input.periodStart,
                    input.periodEnd,
                    input.meter.grossEnergyWh,
                    input.meter.netEnergyWh,
                    input.meter.fuelG,
                    input.meter.readingsDigest
                )
            );
    }

    /// @notice ACM0002 / AMS-I.D quantification of a monitoring period against the plant's current ledger,
    /// without recording anything. `submitAttestation` stores exactly these numbers.
    ///   EG_PJ = EG_facility (greenfield) or the crediting year's excess over EG_historical + σ (retrofit,
    ///           capacity addition) until DATE_BaselineRetrofit;
    ///   BE = ⌊EG_PJ × EF_grid,CM⌋;  PE_HP = ⌈TEG × EF_Res⌉ when 4 < PD ≤ 10;  PE_FF = ⌈FC × COEF⌉;
    ///   LE = input leakage + ⌈EG × EF_embodied⌉ (VMR0017: EG_facility for greenfield; for a capacity addition the
    ///   greater of EG_PJ and EG_facility × Cap_add / Cap_PJ, so the added units are not under-counted; none for
    ///   retrofits);
    ///   ER = BE − PE_HP − PE_FF − LE; credits = ⌊(ledger balance + ER) / 1 kg⌋.
    function quantify(bytes32 plantId, AttestationInput calldata input) public view returns (Quantification memory q) {
        Plant storage plant = _plants[plantId];
        PlantDesign storage design = plant.design;

        q.creditingYear = uint32((input.periodStart - design.creditingStart) / CREDITING_YEAR);
        int256 yearBefore = q.creditingYear == plant.creditingYear ? int256(plant.yearNetWh) : int256(0);
        q.yearNetWh = yearBefore + input.netEnergyWh;

        if (design.projectType == ProjectType.Greenfield) {
            q.projectEnergyWh = input.netEnergyWh;
        } else if (design.baselineEndsAt != 0 && input.periodEnd > design.baselineEndsAt) {
            q.projectEnergyWh = 0;
        } else {
            // The annual max(EG_facility,y − EG_BL, 0) applied as the crediting year accumulates.
            int256 baseline = int256(uint256(design.baselineWh));
            q.projectEnergyWh = _positive(q.yearNetWh - baseline) - _positive(yearBefore - baseline);
        }

        q.baselineG = _floorDiv(q.projectEnergyWh * int256(uint256(design.efGridGPerMwh)), WH_PER_MWH);
        q.reservoirG = _ceilDiv(uint256(input.grossEnergyWh) * plant.reservoirGPerMwh, WH_PER_MWH);
        q.fossilFuelG = _ceilDiv(uint256(input.fuelG) * design.fuelCoefGPerTonne, G_PER_TONNE);
        // A period that imports more than it exports carries no embodied emissions rather than negative ones.
        int256 embodiedBasisWh = design.projectType == ProjectType.Greenfield
            ? int256(input.netEnergyWh)
            : design.projectType == ProjectType.CapacityAddition
                ? int256(
                    _capacityAdditionLeakageWh(
                        design.capacityKw,
                        design.baselineCapacityKw,
                        input.netEnergyWh,
                        q.projectEnergyWh
                    )
                )
                : int256(0);
        q.leakageG =
            uint256(input.leakageG) +
            _ceilDiv(uint256(_positive(embodiedBasisWh)) * plant.embodiedGPerMwh, WH_PER_MWH);
        q.reductionG = q.baselineG - int256(q.reservoirG) - int256(q.fossilFuelG) - int256(q.leakageG);

        int256 balance = int256(plant.balanceG) + q.reductionG;
        q.units = balance > 0 ? uint256(balance) / G_PER_UNIT : 0;
        q.balanceG = balance - int256(q.units * G_PER_UNIT);
    }

    // ─── Custody ─────────────────────────────────────────────────────────────

    /// @notice Moves credits from registry custody to the caller's wallet. The caller must be associated with the
    /// HTS token first (HIP-719: call `associate()` on the token address, or use auto-association slots).
    function withdraw(uint256 units) external nonReentrant {
        _debitCustody(msg.sender, units);
        HederaTokenLib.transferFromSelf(creditToken, msg.sender, units);
        emit Withdrawn(msg.sender, units);
    }

    /// @notice Permanently retires credits from the caller's custody balance by burning them on HTS.
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

    /// @notice Lists `units` (kg CO2e) from the caller's custody at a USD price per tonne.
    function createListing(
        uint64 units,
        uint64 priceUsdCentsPerTonne
    ) external nonReentrant returns (uint256 listingId) {
        if (priceUsdCentsPerTonne == 0) revert ZeroAmount();
        _debitCustody(msg.sender, units);

        listingId = _listings.length;
        _listings.push(
            Listing({
                seller: msg.sender,
                unitsAvailable: units,
                priceUsdCentsPerTonne: priceUsdCentsPerTonne,
                active: true
            })
        );
        emit ListingCreated(listingId, msg.sender, units, priceUsdCentsPerTonne);
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

    /// @notice Buys `units` (kg CO2e) from a listing into the caller's custody balance. Excess payment is refunded.
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

    /// @notice Native amount (tinybar on Hedera) required to buy `units` kg from `listingId` at the oracle price.
    function quote(uint256 listingId, uint64 units) public view returns (uint256 nativeCost) {
        Listing storage listing = _activeListing(listingId);
        if (units == 0) revert ZeroAmount();
        if (units > listing.unitsAvailable) revert InsufficientListingUnits(units, listing.unitsAvailable);
        return usdCentsPerTonneToNative(listing.priceUsdCentsPerTonne, units);
    }

    /// @notice Converts a USD price per tonne into the native amount for `units` kg, rounding up.
    function usdCentsPerTonneToNative(uint64 priceUsdCentsPerTonne, uint64 units) public view returns (uint256) {
        (uint256 answer, uint8 feedDecimals) = _freshHbarUsd();
        // cost(USD) = price/100 * units/1000 ; HBAR = USD / (answer / 10^d) ; native = HBAR * NATIVE_UNITS_PER_HBAR
        uint256 numerator = uint256(priceUsdCentsPerTonne) * units * (10 ** feedDecimals) * NATIVE_UNITS_PER_HBAR;
        uint256 denominator = 100 * UNITS_PER_CREDIT * answer;
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

    /// @dev Returns the PE_HP rate implied by the power density PD = (Cap_PJ − Cap_BL) / (A_PJ − A_BL).
    function _validateDesign(PlantDesign calldata design) private pure returns (uint32 reservoirRate) {
        if (design.capacityKw == 0) revert InvalidBaseline(design.projectType);
        if (design.methodology == Methodology.Vmr0017 && design.capacityKw > VMR0017_MAX_HYDRO_KW) {
            revert MethodologyNotApplicable(design.methodology, design.capacityKw);
        }
        if (design.efGridGPerMwh == 0 || design.efGridGPerMwh > MAX_GRID_EF_G_PER_MWH) {
            revert GridEmissionFactorOutOfRange(design.efGridGPerMwh);
        }
        _validateCrediting(design.methodology, design.creditingStart, design.creditingEnd);

        if (design.projectType == ProjectType.Greenfield) {
            if (design.baselineCapacityKw != 0 || design.baselineWh != 0 || design.baselineEndsAt != 0) {
                revert InvalidBaseline(design.projectType);
            }
        } else if (
            design.baselineCapacityKw == 0 ||
            design.baselineWh == 0 ||
            design.baselineEndsAt == 0 ||
            (design.projectType == ProjectType.CapacityAddition && design.capacityKw <= design.baselineCapacityKw)
        ) {
            revert InvalidBaseline(design.projectType);
        }

        if (design.reservoirAreaM2 < design.baselineReservoirAreaM2) {
            revert ReservoirBelowBaseline(design.reservoirAreaM2, design.baselineReservoirAreaM2);
        }
        uint256 addedArea = design.reservoirAreaM2 - design.baselineReservoirAreaM2;
        if (addedArea == 0) return 0;
        uint256 addedW = design.capacityKw > design.baselineCapacityKw
            ? (uint256(design.capacityKw) - design.baselineCapacityKw) * 1_000
            : 0;
        if (addedW <= MIN_POWER_DENSITY * addedArea) revert PowerDensityTooLow(addedW, addedArea);
        if (addedW > RESERVOIR_EMISSIONS_POWER_DENSITY * addedArea) return 0;
        return design.methodology == Methodology.Vmr0017 ? VMR0017_RESERVOIR_EF_G_PER_MWH : RESERVOIR_EF_G_PER_MWH;
    }

    /// @dev A crediting period is exactly 5, 7 or 10 years of 365 days. From 1 Jan 2027 a VMR0017 period is 5 years.
    function _validateCrediting(Methodology methodology, uint64 creditingStart, uint64 creditingEnd) private pure {
        if (creditingEnd <= creditingStart) revert InvalidCreditingPeriod(creditingStart, creditingEnd);
        uint256 span = uint256(creditingEnd) - creditingStart;
        bool five = span == 5 * CREDITING_YEAR;
        bool seven = span == 7 * CREDITING_YEAR;
        bool ten = span == 10 * CREDITING_YEAR;
        if (
            (!five && !seven && !ten) ||
            (methodology == Methodology.Vmr0017 && creditingStart >= VCS_FIVE_YEAR_FROM && !five)
        ) {
            revert InvalidCreditingPeriod(creditingStart, creditingEnd);
        }
    }

    /// @dev VMR0017 eq.(20) has no separate added-unit meter here. Leakage uses the higher of EG_PJ and the added
    /// capacity's share of EG_facility, and never a negative quantity.
    function _capacityAdditionLeakageWh(
        uint32 capacityKw,
        uint32 baselineCapacityKw,
        int64 netEnergyWh,
        int256 projectEnergyWh
    ) private pure returns (uint256) {
        uint256 facility = uint256(_positive(netEnergyWh));
        uint256 addedKw = capacityKw > baselineCapacityKw ? uint256(capacityKw) - baselineCapacityKw : 0;
        uint256 share = capacityKw == 0 ? 0 : (facility * addedKw) / capacityKw;
        uint256 project = uint256(_positive(projectEnergyWh));
        return share > project ? share : project;
    }

    function _checkAttestation(Plant storage plant, AttestationInput calldata input) private view {
        PlantDesign storage design = plant.design;
        if (!plant.active) revert PlantInactive(input.plantId);
        if (input.periodEnd <= input.periodStart || input.periodEnd > block.timestamp) {
            revert InvalidPeriod(input.periodStart, input.periodEnd);
        }
        if (input.periodStart < plant.lastPeriodEnd) {
            revert PeriodOverlapsPrevious(input.periodStart, plant.lastPeriodEnd);
        }
        if (input.periodStart < design.creditingStart || input.periodEnd > design.creditingEnd) {
            revert OutsideCreditingPeriod(input.periodStart, input.periodEnd);
        }
        if (
            (input.periodStart - design.creditingStart) / CREDITING_YEAR !=
            (input.periodEnd - 1 - design.creditingStart) / CREDITING_YEAR
        ) revert PeriodCrossesCreditingYear(input.periodStart, input.periodEnd);
        if (input.plantSequence != plant.attestations) revert StaleLedger(plant.attestations, input.plantSequence);
        if (input.completenessBps > MAX_BPS) revert InvalidCompleteness(input.completenessBps);
        if (input.completenessBps < minCompletenessBps) {
            revert CompletenessTooLow(input.completenessBps, minCompletenessBps);
        }
        if (input.reportHash == bytes32(0)) revert EmptyReportHash();
        if (auditTopic == 0 || input.hcsTopicNum != auditTopic || input.hcsSequence == 0) {
            revert Unanchored(input.hcsTopicNum, input.hcsSequence);
        }

        uint256 maxEnergyWh = (uint256(design.capacityKw) * (input.periodEnd - input.periodStart) * 1_000) / 3_600;
        if (input.grossEnergyWh > maxEnergyWh) revert EnergyExceedsCapacity(input.grossEnergyWh, maxEnergyWh);
        if (input.netEnergyWh > 0 && uint64(input.netEnergyWh) > input.grossEnergyWh) {
            revert NetExceedsGross(input.netEnergyWh, input.grossEnergyWh);
        }
        if (input.fuelG > 0 && design.fuelCoefGPerTonne == 0) revert FuelNotRegistered();

        // The meter's signature fixes the raw totals. QA/QC may only lower net export and raise fuel; gross generation
        // (the PE_HP basis) is the metered value, capped only by what the nameplate can produce in the period.
        address signer = ECDSA.recover(
            // EIP-191 personal_sign prefix, inlined: OpenZeppelin's MessageHashUtils needs a Cancun EVM (mcopy).
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", meterStatementHash(input.plantId, input))),
            input.meter.signature
        );
        if (signer != plant.meter) revert InvalidMeterSignature(signer, plant.meter);
        uint256 meteredGross = input.meter.grossEnergyWh;
        if (
            input.netEnergyWh > input.meter.netEnergyWh ||
            input.fuelG < input.meter.fuelG ||
            input.grossEnergyWh != (meteredGross < maxEnergyWh ? meteredGross : maxEnergyWh)
        ) revert NotMetered(input.grossEnergyWh, input.netEnergyWh, input.fuelG);
    }

    function _claimDesign(bytes32 plantId, bytes32 designHash) private {
        if (designHash == bytes32(0)) revert EmptyDesignHash();
        bytes32 holder = plantOfDesign[designHash];
        if (holder != bytes32(0) && holder != plantId) revert DesignAlreadyRegistered(designHash);
        plantOfDesign[designHash] = plantId;
    }

    function _claimMeter(bytes32 plantId, address meter) private {
        bytes32 holder = plantOfMeter[meter];
        if (holder != bytes32(0) && holder != plantId) revert MeterAlreadyRegistered(meter);
        plantOfMeter[meter] = plantId;
    }

    function _existingPlant(bytes32 plantId) private view returns (Plant storage plant) {
        plant = _plants[plantId];
        if (plant.operator == address(0)) revert InvalidPlant(plantId);
    }

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

        HederaTokenLib.burn(creditToken, units);
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

    /// @dev Solidity division truncates toward zero; baseline emissions must round toward −∞.
    function _floorDiv(int256 a, uint256 b) private pure returns (int256 q) {
        q = a / int256(b);
        if (a < 0 && a % int256(b) != 0) q -= 1;
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        return (a + b - 1) / b;
    }

    function _positive(int256 a) private pure returns (int256) {
        return a > 0 ? a : int256(0);
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
