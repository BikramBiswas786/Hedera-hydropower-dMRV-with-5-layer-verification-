// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { HederaTokenLib } from "./lib/HederaTokenLib.sol";
import { IMethodology, Measurement, ProjectTerms, QuantResult } from "./interfaces/IMethodology.sol";

/// @title DmrvRegistry
/// @notice Methodology-agnostic dMRV registry on Hedera, in the order the VCS Program runs a project:
///   1. Validation. A VVB (`VERIFIER_ROLE`) signs a `ValidationApproval` over the project design, the module
///      parameters and its validation report; only then may the admin register the project (or renew a period).
///   2. Monitoring. Each period's raw totals are signed by the plant's meter and recorded by the operator (or the
///      reporter it names). The project's stateless module (`IMethodology`) quantifies ER = BE − PE − LE. Nothing is
///      issued: a record is monitored, not verified.
///   3. Verification. A VVB signs a `VerificationStatement` over a contiguous run of records (committed by a hash
///      chain), its verification report and an optional deduction. An approval issues Hedera Token Service units
///      into the operator's custody (1 token = 1 t CO2e, 1 base unit = 1 kg); a rejection closes the run unissued.
/// Units are verified emission reductions under the registered methodology. They are not Verra VCUs unless the
/// issuance names a VCU serial range (`vcuReferenceOf`), which is recorded, not checked.
/// @dev Every HTS call lives in this contract's own code. The tokens use `contractId` keys, which Hedera honours only
/// for code executing as this contract, so modules and the market never touch HTS (they are called with STATICCALL
/// or call back through the `market` hooks). The contract is not upgradeable: rule changes ship as new module
/// versions that apply to new projects, and a core change is a new deployment.
contract DmrvRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint16 public constant MAX_BPS = 10_000;
    int32 public constant CREDIT_DECIMALS = 3;
    uint256 public constant G_PER_UNIT = 1_000;
    uint256 public constant MAX_BENEFICIARY_BYTES = 128;
    uint8 public constant DECISION_APPROVED = 1;
    uint8 public constant DECISION_REJECTED = 2;

    bytes32 public constant METER_STATEMENT_TYPEHASH =
        keccak256(
            "MeterStatement(bytes32 projectId,uint32 sequence,uint64 periodStart,uint64 periodEnd,uint32 intervals,uint32 intervalSeconds,bytes32 meteredHash,bytes32 readingsDigest)"
        );
    bytes32 public constant VALIDATION_APPROVAL_TYPEHASH =
        keccak256(
            "ValidationApproval(bytes32 projectId,address module,address operator,address meter,bytes32 designHash,bytes32 paramsHash,bytes32 reportHash,bytes32 externalId,uint8 creditingPeriod)"
        );
    bytes32 public constant VERIFICATION_STATEMENT_TYPEHASH =
        keccak256(
            "VerificationStatement(bytes32 projectId,uint32 firstRecord,uint32 lastRecord,bytes32 recordsHash,uint64 deductionG,bytes32 reportHash,uint64 hcsTopicNum,uint64 hcsSequence,bytes32 evidenceHash,uint8 decision)"
        );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// @notice Minimum share of a period covered by accepted readings. Fixed at deployment.
    uint16 public immutable minCompletenessBps;

    bytes32 private immutable _DOMAIN_SEPARATOR;
    uint256 private immutable _CHAIN_ID;

    struct Project {
        address operator;
        /// @dev secp256k1 key of the data logger. It signs every period's `MeterStatement`.
        address meter;
        /// @dev May record monitoring for the operator (e.g. its server). Named by the operator; zero for none.
        address reporter;
        /// @dev The VVB whose `ValidationApproval` registered (or last renewed) the project.
        address validator;
        IMethodology module;
        bool active;
        uint8 creditingPeriods;
        /// @dev Monitoring records so far, and how many of them a verification has closed (approved or rejected).
        uint32 attestations;
        uint32 verifiedRecords;
        uint64 creditingStart;
        uint64 creditingEnd;
        uint64 lastPeriodEnd;
        uint64 calibrationValidUntil;
        uint64 registrationRequestedAt;
        /// @dev Unissued ER in grams: a sub-kg remainder, or a deficit carried forward (across renewals too).
        int128 balanceG;
        uint128 issuedUnits;
        /// @dev The module's ledger word (e.g. crediting year and its accumulated energy).
        bytes32 state;
        /// @dev Head of the hash chain over this project's monitoring records.
        bytes32 recordsHash;
        bytes32 designHash;
        bytes32 validationReportHash;
        /// @dev Optional id of the same project in an external program (e.g. keccak256 of a Verra project id).
        bytes32 externalId;
        bytes params;
    }

    /// @notice What a VVB validated and the admin registers.
    struct Registration {
        bytes32 projectId;
        IMethodology module;
        address operator;
        address meter;
        bytes32 designHash;
        bytes32 validationReportHash;
        bytes32 externalId;
        bytes params;
    }

    /// @notice One monitoring period. The meter's signature fixes the raw totals; the operator records it.
    struct Submission {
        bytes32 projectId;
        /// @dev Must equal the project's record count, so a meter signature is usable once.
        uint32 sequence;
        /// @dev Accepted readings and their interval length, as signed by the meter; completeness is computed here.
        uint32 intervals;
        uint32 intervalSeconds;
        /// @dev SHA-256 of the readings batch published on HCS.
        bytes32 readingsDigest;
        /// @dev SHA-256 of the monitoring report message published on HCS.
        bytes32 reportHash;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
        Measurement measurement;
        bytes meterSignature;
    }

    /// @notice A monitoring record: quantified, not issued.
    struct Attestation {
        bytes32 projectId;
        uint32 sequence;
        uint64 periodStart;
        uint64 periodEnd;
        int64 reductionG;
        /// @dev Sum of `reductionG` over this project's records up to and including this one.
        int128 cumulativeG;
        uint16 completenessBps;
        address meter;
        /// @dev Sequence number on the audit topic (`auditTopic`) of the monitoring report message.
        uint64 hcsSequence;
        uint64 timestamp;
        bytes32 reportHash;
        bytes32 readingsDigest;
        /// @dev keccak256(previous chain head, this record's digest). A verification signs the head it covers.
        bytes32 chainHash;
        /// @dev The module-encoded figures quantified (hydro: `Energy(netWh, grossWh, fuelG, leakageG)`).
        bytes verified;
        /// @dev The module's quantification breakdown, so a reader needs one call to reproduce the period.
        bytes breakdown;
    }

    /// @notice A VVB's verification of records `firstRecord..lastRecord` (project sequence numbers, inclusive).
    struct VerificationStatement {
        bytes32 projectId;
        uint32 firstRecord;
        uint32 lastRecord;
        bytes32 recordsHash;
        /// @dev Grams the VVB deducts from the monitored total (its own QA/QC findings). Never adds.
        uint64 deductionG;
        /// @dev SHA-256 of the verification report published on HCS.
        bytes32 reportHash;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
        /// @dev Optional external evidence the VVB relied on (e.g. a Guardian VP); each value backs one issuance.
        bytes32 evidenceHash;
        uint8 decision;
    }

    struct Issuance {
        bytes32 projectId;
        uint32 firstRecord;
        uint32 lastRecord;
        uint8 decision;
        int128 monitoredG;
        uint64 deductionG;
        uint64 unitsIssued;
        address verifier;
        uint64 timestamp;
        /// @dev Sequence number on the audit topic of the verification report message.
        uint64 hcsSequence;
        bytes32 reportHash;
        bytes32 evidenceHash;
    }

    struct Retirement {
        address account;
        uint64 units;
        uint64 timestamp;
        string beneficiary;
        uint64 certificateSerial;
        bool certificateDelivered;
    }


    /// @notice The one market allowed to move custody (listing escrow, delivery, retire-on-purchase). Set once:
    /// no role grant can add another, so the admin has no path to anyone's balance.
    address public market;
    address public creditToken;
    address public certificateToken;
    /// @dev HCS topic monitoring and verification reports must cite. Zero until set; both revert until then.
    uint64 public auditTopic;
    uint256 public totalIssuedUnits;
    uint256 public totalRetiredUnits;

    mapping(address account => uint256 units) public custodyBalanceOf;
    mapping(IMethodology module => bool) public approvedModule;
    mapping(address meter => bytes32 projectId) public projectOfMeter;
    mapping(bytes32 designHash => bytes32 projectId) public projectOfDesign;
    /// @notice One external program id (e.g. a Verra project) maps to one project here, so it cannot be issued twice.
    mapping(bytes32 externalId => bytes32 projectId) public projectOfExternalId;
    /// @notice Evidence hashes already backing an issuance. One external document cannot back two.
    mapping(bytes32 evidenceHash => bool) public evidenceUsed;

    mapping(bytes32 projectId => Project) private _projects;
    mapping(bytes32 projectId => uint256[] attestationIds) private _recordsOf;
    bytes32[] private _projectIds;
    Attestation[] private _attestations;
    Issuance[] private _issuances;
    Retirement[] private _retirements;

    event CreditTokenCreated(address indexed token);
    event CertificateTokenCreated(address indexed token);
    event ModuleApproved(
        address indexed module,
        bytes32 methodologyId,
        uint32 version,
        bytes32 schemaHash,
        bool approved
    );
    event ProjectRegistered(
        bytes32 indexed projectId,
        address indexed module,
        address indexed operator,
        address meter,
        bytes32 designHash,
        bytes params
    );
    event ProjectValidated(
        bytes32 indexed projectId,
        address indexed validator,
        uint8 creditingPeriod,
        bytes32 reportHash,
        bytes32 externalId
    );
    event CreditingPeriodRenewed(bytes32 indexed projectId, uint64 creditingStart, uint64 creditingEnd, bytes params);
    event ProjectStatusChanged(bytes32 indexed projectId, bool active);
    event MeterChanged(bytes32 indexed projectId, address indexed meter);
    event ReporterChanged(bytes32 indexed projectId, address indexed reporter);
    event CalibrationUpdated(bytes32 indexed projectId, uint64 validUntil, bytes32 certificateHash);
    event AuditTopicSet(uint64 topic);
    event MarketSet(address indexed market);
    event MonitoringRecorded(
        uint256 indexed attestationId,
        bytes32 indexed projectId,
        uint32 sequence,
        int256 reductionG,
        bytes32 reportHash,
        uint64 hcsTopicNum,
        uint64 hcsSequence,
        bytes32 chainHash,
        bytes breakdown
    );
    event PeriodVerified(
        uint256 indexed issuanceId,
        bytes32 indexed projectId,
        address indexed verifier,
        uint32 firstRecord,
        uint32 lastRecord,
        uint8 decision,
        int256 monitoredG,
        uint64 deductionG,
        uint256 unitsIssued,
        bytes32 reportHash,
        bytes32 evidenceHash
    );
    event CustodyMoved(address indexed from, address indexed to, uint256 units);
    event Withdrawn(address indexed account, uint256 units);
    event Deposited(address indexed account, uint256 units);
    event Retired(uint256 indexed retirementId, address indexed account, uint64 units, string beneficiary);
    event CertificateIssued(uint256 indexed retirementId, uint64 serial, bool delivered);
    event CertificateClaimed(uint256 indexed retirementId, address indexed account, uint64 serial);

    error ZeroAddress();
    error TokenAlreadyCreated();
    error TokenNotCreated();
    error ModuleNotApproved(address module);
    error InvalidProject(bytes32 projectId);
    error ProjectAlreadyRegistered(bytes32 projectId);
    error ProjectInactive(bytes32 projectId);
    error EmptyDesignHash();
    error EmptyReportHash();
    error MeterAlreadyRegistered(address meter);
    error DesignAlreadyRegistered(bytes32 designHash);
    error ExternalIdAlreadyRegistered(bytes32 externalId);
    error RegistrationInTheFuture(uint64 requestedAt);
    error InvalidCompleteness(uint16 value);
    error InvalidPeriod(uint64 periodStart, uint64 periodEnd);
    error PeriodOverlapsPrevious(uint64 periodStart, uint64 lastPeriodEnd);
    error OutsideCreditingPeriod(uint64 periodStart, uint64 periodEnd);
    error CalibrationExpired(uint64 periodEnd, uint64 calibrationValidUntil);
    error StaleLedger(uint32 expected, uint32 provided);
    error Unanchored(uint64 topic, uint64 sequence);
    error CompletenessTooLow(uint16 completenessBps, uint16 minCompletenessBps);
    error InvalidMeterSignature(address signer, address meter);
    error NotReporter(address caller);
    error UnregisteredVerifier(address signer);
    error VerifierIsParty(address verifier);
    error InvalidRecordRange(uint32 firstRecord, uint32 lastRecord);
    error RecordsHashMismatch(bytes32 expected, bytes32 provided);
    error InvalidDecision(uint8 decision);
    error EvidenceAlreadyUsed(bytes32 evidenceHash);
    error WrongChain(uint256 chainId);
    error ZeroAmount();
    error InsufficientCustody(uint256 requested, uint256 available);
    error BeneficiaryTooLong();
    error NoCertificateToClaim(uint256 retirementId);
    error NotRetirementOwner(uint256 retirementId);
    error InvalidIssuance(uint256 issuanceId);
    error NativeTransferFailed();
    error MarketAlreadySet(address market);
    error NotMarket(address caller);

    /// @param admin Account granted DEFAULT_ADMIN_ROLE. Use a Hedera threshold-key account (e.g. 2-of-3).
    /// @param minCompletenessBps_ Minimum share of a period covered by accepted readings.
    constructor(address admin, uint16 minCompletenessBps_) {
        if (admin == address(0)) revert ZeroAddress();
        if (minCompletenessBps_ > MAX_BPS) revert InvalidCompleteness(minCompletenessBps_);
        _CHAIN_ID = block.chainid;
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("DmrvRegistry"), keccak256("2"), block.chainid, address(this))
        );
        minCompletenessBps = minCompletenessBps_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Creates the HTS credit token with this contract as treasury, admin and supply key.
    function createCreditToken(
        string calldata name,
        string calldata symbol,
        string calldata memo
    ) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        if (creditToken != address(0)) revert TokenAlreadyCreated();
        creditToken = HederaTokenLib.createContractOwnedToken(name, symbol, memo, CREDIT_DECIMALS, msg.value);
        emit CreditTokenCreated(creditToken);
    }

    /// @notice Creates the HTS NFT collection for retirement certificates (metadata `dmrv:retirement:<id>`).
    function createCertificateToken(
        string calldata name,
        string calldata symbol,
        string calldata memo
    ) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        if (certificateToken != address(0)) revert TokenAlreadyCreated();
        certificateToken = HederaTokenLib.createContractOwnedNft(name, symbol, memo, msg.value);
        emit CertificateTokenCreated(certificateToken);
    }

    /// @notice Approves or withdraws a methodology module for new registrations. Registered projects keep theirs.
    function setModuleApproved(IMethodology module, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(module) == address(0)) revert ZeroAddress();
        approvedModule[module] = approved;
        emit ModuleApproved(address(module), module.methodologyId(), module.version(), module.schemaHash(), approved);
    }

    /// @notice Registers a validated project under an approved module. A VVB that is neither the operator nor the
    /// meter must have signed the `ValidationApproval` for exactly this registration (VCS: validation precedes
    /// registration). The module validates `params` (applicability, crediting period, registration-request date)
    /// and returns the terms this contract enforces.
    function registerProject(
        Registration calldata r,
        bytes calldata validationSignature
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (r.projectId == bytes32(0) || r.operator == address(0)) revert InvalidProject(r.projectId);
        if (r.meter == address(0)) revert ZeroAddress();
        if (!approvedModule[r.module]) revert ModuleNotApproved(address(r.module));
        Project storage p = _projects[r.projectId];
        if (p.operator != address(0)) revert ProjectAlreadyRegistered(r.projectId);
        ProjectTerms memory t = r.module.validateProject(r.params);
        if (t.registrationRequestedAt > block.timestamp) revert RegistrationInTheFuture(t.registrationRequestedAt);
        address validator = _validator(
            r.projectId,
            address(r.module),
            r.operator,
            r.meter,
            r.designHash,
            r.params,
            r.validationReportHash,
            r.externalId,
            1,
            validationSignature
        );
        _claimDesign(r.projectId, r.designHash);
        _claimMeter(r.projectId, r.meter);
        if (r.externalId != bytes32(0)) {
            if (projectOfExternalId[r.externalId] != bytes32(0)) revert ExternalIdAlreadyRegistered(r.externalId);
            projectOfExternalId[r.externalId] = r.projectId;
        }

        p.operator = r.operator;
        p.meter = r.meter;
        p.validator = validator;
        p.module = r.module;
        p.active = true;
        p.creditingPeriods = 1;
        _applyTerms(p, t);
        p.designHash = r.designHash;
        p.validationReportHash = r.validationReportHash;
        p.externalId = r.externalId;
        p.params = r.params;
        _projectIds.push(r.projectId);
        emit ProjectRegistered(r.projectId, address(r.module), r.operator, r.meter, r.designHash, r.params);
        emit ProjectValidated(r.projectId, validator, 1, r.validationReportHash, r.externalId);
    }

    /// @notice Starts the next crediting period after a VVB validated it (baseline reassessment). The project's own
    /// module decides what may change and enforces the renewal rules. The module ledger restarts; any ER deficit
    /// carries over. Records of the previous period must all be verified first.
    function renewCreditingPeriod(
        bytes32 projectId,
        bytes calldata newParams,
        bytes32 validationReportHash,
        bytes calldata validationSignature
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Project storage p = _existing(projectId);
        if (p.verifiedRecords != p.attestations) revert InvalidRecordRange(p.verifiedRecords, p.attestations);
        ProjectTerms memory t = p.module.validateRenewal(
            p.params,
            newParams,
            p.creditingStart,
            p.creditingEnd,
            p.creditingPeriods
        );
        uint8 period = p.creditingPeriods + 1;
        p.validator = _validator(
            projectId,
            address(p.module),
            p.operator,
            p.meter,
            p.designHash,
            newParams,
            validationReportHash,
            p.externalId,
            period,
            validationSignature
        );
        _applyTerms(p, t);
        p.creditingPeriods = period;
        p.params = newParams;
        p.validationReportHash = validationReportHash;
        p.state = bytes32(0);
        emit CreditingPeriodRenewed(projectId, t.creditingStart, t.creditingEnd, newParams);
        emit ProjectValidated(projectId, p.validator, period, validationReportHash, p.externalId);
    }

    function setMeter(bytes32 projectId, address meter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (meter == address(0)) revert ZeroAddress();
        Project storage p = _existing(projectId);
        if (meter != p.meter) {
            _claimMeter(projectId, meter);
            projectOfMeter[p.meter] = bytes32(0);
            p.meter = meter;
        }
        emit MeterChanged(projectId, meter);
    }

    /// @notice Records a new calibration certificate for the project's meter. Periods ending after the date the
    /// certificate covers are rejected; the certificate itself is committed by hash.
    function setCalibrationValidUntil(
        bytes32 projectId,
        uint64 validUntil,
        bytes32 certificateHash
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (certificateHash == bytes32(0)) revert EmptyDesignHash();
        _existing(projectId).calibrationValidUntil = validUntil;
        emit CalibrationUpdated(projectId, validUntil, certificateHash);
    }

    function setProjectActive(bytes32 projectId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _existing(projectId).active = active;
        emit ProjectStatusChanged(projectId, active);
    }


    /// @notice Names the market contract, once. A new market means a new registry deployment.
    function setMarket(address market_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (market_ == address(0) || market_.code.length == 0) revert ZeroAddress();
        if (market != address(0)) revert MarketAlreadySet(market);
        market = market_;
        emit MarketSet(market_);
    }

    /// @notice Fixes the HCS topic every later attestation must cite. It cannot be cleared.
    function setAuditTopic(uint64 topic) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (topic == 0) revert Unanchored(0, 0);
        auditTopic = topic;
        emit AuditTopicSet(topic);
    }





    /// @notice Recovers HBAR left over from HTS creation fees. The registry holds no one else's HBAR.
    function sweepHbar(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{ value: address(this).balance }("");
        if (!ok) revert NativeTransferFailed();
    }

    /// @notice The operator names (or clears) an account that may record monitoring for it, such as its server.
    function setReporter(bytes32 projectId, address reporter) external {
        Project storage p = _existing(projectId);
        if (msg.sender != p.operator) revert NotReporter(msg.sender);
        p.reporter = reporter;
        emit ReporterChanged(projectId, reporter);
    }

    // ─── Monitoring ──────────────────────────────────────────────────────────

    /// @notice Records one monitoring period. The meter's signature fixes the raw totals; the module rejects figures
    /// more generous than them and quantifies ER. Nothing is issued until a VVB verifies the record.
    function recordMonitoring(Submission calldata s) external nonReentrant returns (uint256 attestationId) {
        Project storage p = _existing(s.projectId);
        if (msg.sender != p.operator && (p.reporter == address(0) || msg.sender != p.reporter)) {
            revert NotReporter(msg.sender);
        }
        uint16 completeness = _checkPeriod(p, s);
        bytes32 meterDigest = _meterStatementDigest(s);
        address meterSigner = ECDSA.recover(meterDigest, s.meterSignature);
        if (meterSigner != p.meter) revert InvalidMeterSignature(meterSigner, p.meter);

        Measurement calldata m = s.measurement;
        QuantResult memory q = p.module.quantify(p.params, p.state, m);
        bytes32 chainHash = keccak256(
            abi.encode(
                p.recordsHash,
                meterDigest,
                keccak256(m.verified),
                s.reportHash,
                s.hcsTopicNum,
                s.hcsSequence,
                q.reductionG
            )
        );
        int128 cumulative = (
            p.attestations == 0 ? int128(0) : _attestations[_recordsOf[s.projectId][p.attestations - 1]].cumulativeG
        ) + int128(q.reductionG);
        p.state = q.newState;
        p.recordsHash = chainHash;
        p.lastPeriodEnd = m.periodEnd;

        attestationId = _attestations.length;
        _recordsOf[s.projectId].push(attestationId);
        _attestations.push(
            Attestation({
                projectId: s.projectId,
                sequence: p.attestations,
                periodStart: m.periodStart,
                periodEnd: m.periodEnd,
                reductionG: int64(q.reductionG),
                cumulativeG: cumulative,
                completenessBps: completeness,
                meter: meterSigner,
                hcsSequence: s.hcsSequence,
                timestamp: uint64(block.timestamp),
                reportHash: s.reportHash,
                readingsDigest: s.readingsDigest,
                chainHash: chainHash,
                verified: m.verified,
                breakdown: q.breakdown
            })
        );
        p.attestations += 1;
        emit MonitoringRecorded(
            attestationId,
            s.projectId,
            p.attestations - 1,
            q.reductionG,
            s.reportHash,
            s.hcsTopicNum,
            s.hcsSequence,
            chainHash,
            q.breakdown
        );
    }

    /// @notice EIP-712 digest the project's meter signs for a monitoring period.
    function _meterStatementDigest(Submission calldata s) private view returns (bytes32) {
        Measurement calldata m = s.measurement;
        return
            _typedDigest(
                keccak256(
                    abi.encode(
                        METER_STATEMENT_TYPEHASH,
                        s.projectId,
                        s.sequence,
                        m.periodStart,
                        m.periodEnd,
                        s.intervals,
                        s.intervalSeconds,
                        keccak256(m.metered),
                        s.readingsDigest
                    )
                )
            );
    }

    // ─── Verification and issuance ───────────────────────────────────────────

    /// @notice Closes the next run of monitoring records with a VVB's verification. Anyone may relay it. An approval
    /// issues ⌊(balance + monitored ER − deduction) / 1000⌋ units into the operator's custody and carries the rest;
    /// a rejection issues nothing and discards the run's ER.
    function verifyPeriod(
        VerificationStatement calldata v,
        bytes calldata signature
    ) external nonReentrant returns (uint256 issuanceId) {
        address token = creditToken;
        if (token == address(0)) revert TokenNotCreated();
        Project storage p = _existing(v.projectId);
        if (v.decision != DECISION_APPROVED && v.decision != DECISION_REJECTED) revert InvalidDecision(v.decision);
        if (v.firstRecord != p.verifiedRecords || v.lastRecord < v.firstRecord || v.lastRecord >= p.attestations) {
            revert InvalidRecordRange(v.firstRecord, v.lastRecord);
        }
        uint256[] storage records = _recordsOf[v.projectId];
        Attestation storage last = _attestations[records[v.lastRecord]];
        if (last.chainHash != v.recordsHash) revert RecordsHashMismatch(last.chainHash, v.recordsHash);
        if (v.reportHash == bytes32(0)) revert EmptyReportHash();
        _checkAnchor(v.hcsTopicNum, v.hcsSequence);
        address verifier = ECDSA.recover(_verificationDigest(v), signature);
        _checkVerifier(p, verifier);
        if (v.evidenceHash != bytes32(0)) {
            if (evidenceUsed[v.evidenceHash]) revert EvidenceAlreadyUsed(v.evidenceHash);
            evidenceUsed[v.evidenceHash] = true;
        }

        int128 monitored = last.cumulativeG -
            (v.firstRecord == 0 ? int128(0) : _attestations[records[v.firstRecord - 1]].cumulativeG);
        uint256 units;
        if (v.decision == DECISION_APPROVED) {
            int256 balance = int256(p.balanceG) + monitored - int256(uint256(v.deductionG));
            units = balance > 0 ? uint256(balance) / G_PER_UNIT : 0;
            p.balanceG = int128(balance - int256(units * G_PER_UNIT));
            p.issuedUnits += uint128(units);
            totalIssuedUnits += units;
        }
        p.verifiedRecords = v.lastRecord + 1;

        issuanceId = _issuances.length;
        _issuances.push(
            Issuance({
                projectId: v.projectId,
                firstRecord: v.firstRecord,
                lastRecord: v.lastRecord,
                decision: v.decision,
                monitoredG: monitored,
                deductionG: v.deductionG,
                unitsIssued: uint64(units),
                verifier: verifier,
                timestamp: uint64(block.timestamp),
                hcsSequence: v.hcsSequence,
                reportHash: v.reportHash,
                evidenceHash: v.evidenceHash
            })
        );
        if (units > 0) {
            custodyBalanceOf[p.operator] += units;
            HederaTokenLib.mint(token, units);
        }
        emit PeriodVerified(
            issuanceId,
            v.projectId,
            verifier,
            v.firstRecord,
            v.lastRecord,
            v.decision,
            monitored,
            v.deductionG,
            units,
            v.reportHash,
            v.evidenceHash
        );
    }

    /// @notice EIP-712 digest a VVB signs to verify a run of records.
    function _verificationDigest(VerificationStatement calldata v) private view returns (bytes32) {
        return
            _typedDigest(
                keccak256(
                    abi.encode(
                        VERIFICATION_STATEMENT_TYPEHASH,
                        v.projectId,
                        v.firstRecord,
                        v.lastRecord,
                        v.recordsHash,
                        v.deductionG,
                        v.reportHash,
                        v.hcsTopicNum,
                        v.hcsSequence,
                        v.evidenceHash,
                        v.decision
                    )
                )
            );
    }

    /// @notice EIP-712 digest a VVB signs to validate a registration (`creditingPeriod` 1) or a renewal.
    function _validationDigest(
        bytes32 projectId,
        address module,
        address operator,
        address meter,
        bytes32 designHash,
        bytes calldata params,
        bytes32 reportHash,
        bytes32 externalId,
        uint8 creditingPeriod
    ) private view returns (bytes32) {
        return
            _typedDigest(
                keccak256(
                    abi.encode(
                        VALIDATION_APPROVAL_TYPEHASH,
                        projectId,
                        module,
                        operator,
                        meter,
                        designHash,
                        keccak256(params),
                        reportHash,
                        externalId,
                        creditingPeriod
                    )
                )
            );
    }

    function domainSeparator() external view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
    }


    // ─── Custody ─────────────────────────────────────────────────────────────

    /// @notice Moves credits from registry custody to the caller's wallet (associate the HTS token first).
    function withdraw(uint256 units) external nonReentrant {
        _debit(msg.sender, units);
        HederaTokenLib.transferFromSelf(creditToken, msg.sender, units);
        emit Withdrawn(msg.sender, units);
    }

    /// @notice Returns credits from the caller's wallet to registry custody, so they can be listed or retired.
    /// The caller first approves this contract for `units` on the credit token.
    function deposit(uint256 units) external nonReentrant {
        if (units == 0) revert ZeroAmount();
        HederaTokenLib.transferFrom(creditToken, msg.sender, address(this), units);
        custodyBalanceOf[msg.sender] += units;
        emit Deposited(msg.sender, units);
    }

    /// @notice Permanently retires credits from the caller's custody by burning them on HTS.
    function retire(uint64 units, string calldata beneficiary) external nonReentrant returns (uint256) {
        return _retire(msg.sender, units, beneficiary);
    }

    /// @notice Delivers a certificate NFT that could not be sent at retirement time.
    function claimCertificate(uint256 retirementId) external nonReentrant {
        Retirement storage r = _retirements[retirementId];
        if (r.account != msg.sender) revert NotRetirementOwner(retirementId);
        if (r.certificateSerial == 0 || r.certificateDelivered) revert NoCertificateToClaim(retirementId);
        r.certificateDelivered = true;
        HederaTokenLib.transferNftFromSelf(certificateToken, msg.sender, r.certificateSerial);
        emit CertificateClaimed(retirementId, msg.sender, r.certificateSerial);
    }

    /// @notice Market hook: moves custody between accounts (listing escrow, purchase delivery).
    function moveCustody(address from, address to, uint256 units) external onlyMarket {
        if (to == address(0)) revert ZeroAddress();
        _debit(from, units);
        custodyBalanceOf[to] += units;
        emit CustodyMoved(from, to, units);
    }

    /// @notice Market hook: retires credits already moved to `account`, in the same transaction as the purchase.
    function retireFor(
        address account,
        uint64 units,
        string calldata beneficiary
    ) external onlyMarket nonReentrant returns (uint256) {
        return _retire(account, units, beneficiary);
    }

    modifier onlyMarket() {
        if (msg.sender != market || market == address(0)) revert NotMarket(msg.sender);
        _;
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getProject(bytes32 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    function getProjectIds() external view returns (bytes32[] memory) {
        return _projectIds;
    }


    function attestationCount() external view returns (uint256) {
        return _attestations.length;
    }


    function getAttestations(uint256 start, uint256 count) external view returns (Attestation[] memory page) {
        uint256 end = _pageEnd(start, count, _attestations.length);
        page = new Attestation[](end - start);
        for (uint256 i = start; i < end; i++) page[i - start] = _attestations[i];
    }

    function issuanceCount() external view returns (uint256) {
        return _issuances.length;
    }

    function getIssuance(uint256 issuanceId) external view returns (Issuance memory) {
        return _issuances[issuanceId];
    }


    function retirementCount() external view returns (uint256) {
        return _retirements.length;
    }

    function getRetirement(uint256 retirementId) external view returns (Retirement memory) {
        return _retirements[retirementId];
    }


    // ─── Internals ───────────────────────────────────────────────────────────

    function _applyTerms(Project storage p, ProjectTerms memory t) private {
        p.creditingStart = t.creditingStart;
        p.creditingEnd = t.creditingEnd;
        p.calibrationValidUntil = t.calibrationValidUntil;
        p.registrationRequestedAt = t.registrationRequestedAt;
    }

    /// @dev Period, crediting window, calibration, record sequence, HCS anchor and completeness. Returns the
    /// completeness computed from the meter-signed interval count.
    function _checkPeriod(Project storage p, Submission calldata s) private view returns (uint16 completeness) {
        Measurement calldata m = s.measurement;
        if (!p.active) revert ProjectInactive(s.projectId);
        if (m.periodEnd <= m.periodStart || m.periodEnd > block.timestamp)
            revert InvalidPeriod(m.periodStart, m.periodEnd);
        if (m.periodStart < p.lastPeriodEnd) revert PeriodOverlapsPrevious(m.periodStart, p.lastPeriodEnd);
        if (m.periodStart < p.creditingStart || m.periodEnd > p.creditingEnd) {
            revert OutsideCreditingPeriod(m.periodStart, m.periodEnd);
        }
        if (m.periodEnd > p.calibrationValidUntil) revert CalibrationExpired(m.periodEnd, p.calibrationValidUntil);
        if (s.sequence != p.attestations) revert StaleLedger(p.attestations, s.sequence);
        if (s.reportHash == bytes32(0)) revert EmptyReportHash();
        _checkAnchor(s.hcsTopicNum, s.hcsSequence);
        uint256 span = m.periodEnd - m.periodStart;
        uint256 covered = uint256(s.intervals) * s.intervalSeconds;
        completeness = uint16(((covered < span ? covered : span) * MAX_BPS) / span);
        if (completeness < minCompletenessBps) revert CompletenessTooLow(completeness, minCompletenessBps);
    }

    function _checkAnchor(uint64 topic, uint64 sequence) private view {
        if (auditTopic == 0 || topic != auditTopic || sequence == 0) revert Unanchored(topic, sequence);
    }

    /// @dev A VVB for this project: holds VERIFIER_ROLE and is none of the parties it checks.
    function _checkVerifier(Project storage p, address signer) private view {
        if (!hasRole(VERIFIER_ROLE, signer)) revert UnregisteredVerifier(signer);
        if (signer == p.operator || signer == p.meter || signer == p.reporter) revert VerifierIsParty(signer);
    }

    function _validator(
        bytes32 projectId,
        address module,
        address operator,
        address meter,
        bytes32 designHash,
        bytes calldata params,
        bytes32 reportHash,
        bytes32 externalId,
        uint8 creditingPeriod,
        bytes calldata signature
    ) private view returns (address signer) {
        if (reportHash == bytes32(0)) revert EmptyReportHash();
        signer = ECDSA.recover(
            _validationDigest(
                projectId,
                module,
                operator,
                meter,
                designHash,
                params,
                reportHash,
                externalId,
                creditingPeriod
            ),
            signature
        );
        if (!hasRole(VERIFIER_ROLE, signer)) revert UnregisteredVerifier(signer);
        if (signer == operator || signer == meter) revert VerifierIsParty(signer);
    }

    function _typedDigest(bytes32 structHash) private view returns (bytes32) {
        if (block.chainid != _CHAIN_ID) revert WrongChain(block.chainid);
        return keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));
    }

    function _retire(
        address account,
        uint64 units,
        string calldata beneficiary
    ) private returns (uint256 retirementId) {
        if (bytes(beneficiary).length > MAX_BENEFICIARY_BYTES) revert BeneficiaryTooLong();
        _debit(account, units);
        totalRetiredUnits += units;

        retirementId = _retirements.length;
        Retirement storage r = _retirements.push();
        r.account = account;
        r.units = units;
        r.timestamp = uint64(block.timestamp);
        r.beneficiary = beneficiary;

        HederaTokenLib.burn(creditToken, units);
        emit Retired(retirementId, account, units, beneficiary);

        if (certificateToken != address(0)) {
            uint64 serial = HederaTokenLib.mintNft(
                certificateToken,
                abi.encodePacked("dmrv:retirement:", _toDecimal(retirementId))
            );
            bool delivered = HederaTokenLib.tryTransferNftFromSelf(certificateToken, account, serial);
            r.certificateSerial = serial;
            r.certificateDelivered = delivered;
            emit CertificateIssued(retirementId, serial, delivered);
        }
    }

    function _debit(address account, uint256 units) private {
        if (units == 0) revert ZeroAmount();
        uint256 available = custodyBalanceOf[account];
        if (units > available) revert InsufficientCustody(units, available);
        custodyBalanceOf[account] = available - units;
    }

    function _claimDesign(bytes32 projectId, bytes32 designHash) private {
        if (designHash == bytes32(0)) revert EmptyDesignHash();
        bytes32 holder = projectOfDesign[designHash];
        if (holder != bytes32(0) && holder != projectId) revert DesignAlreadyRegistered(designHash);
        projectOfDesign[designHash] = projectId;
    }

    function _claimMeter(bytes32 projectId, address meter) private {
        bytes32 holder = projectOfMeter[meter];
        if (holder != bytes32(0) && holder != projectId) revert MeterAlreadyRegistered(meter);
        projectOfMeter[meter] = projectId;
    }

    function _existing(bytes32 projectId) private view returns (Project storage p) {
        p = _projects[projectId];
        if (p.operator == address(0)) revert InvalidProject(projectId);
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
