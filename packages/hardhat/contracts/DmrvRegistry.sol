// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { HederaTokenLib } from "./lib/HederaTokenLib.sol";
import { IMethodology, Measurement, ProjectTerms, QuantResult } from "./interfaces/IMethodology.sol";

/// @title DmrvRegistry
/// @notice Methodology-agnostic dMRV carbon-credit registry on Hedera. Each project is registered under an
/// admin-approved, stateless methodology module (`IMethodology`) and keeps that module for life. A monitoring period
/// is accepted only with two EIP-712 signatures: the project's registered meter signs the raw totals, and a
/// registered VVB signs an approval that embeds the meter statement's digest together with the figures it accepts.
/// The module rejects verified figures more generous than the metered ones, computes ER = BE − PE − LE, and this
/// contract mints Hedera Token Service credits (1 token = 1 t CO2e, 1 base unit = 1 kg CO2e) into registry custody.
/// @dev Every HTS call lives in this contract's own code. The tokens use `contractId` keys, which Hedera honours only
/// for code executing as this contract, so modules and the market never touch HTS (they are called with STATICCALL
/// or call back through `MARKET_ROLE` hooks). The contract is not upgradeable: rule changes ship as new module
/// versions that apply to new projects, and a core change is a new deployment.
contract DmrvRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant MARKET_ROLE = keccak256("MARKET_ROLE");

    uint16 public constant MAX_BPS = 10_000;
    int32 public constant CREDIT_DECIMALS = 3;
    uint256 public constant G_PER_UNIT = 1_000;
    uint256 public constant MAX_BENEFICIARY_BYTES = 128;
    uint8 public constant DECISION_APPROVED = 1;

    bytes32 public constant METER_STATEMENT_TYPEHASH =
        keccak256(
            "MeterStatement(bytes32 projectId,uint32 sequence,uint64 periodStart,uint64 periodEnd,uint32 intervals,uint32 intervalSeconds,bytes32 meteredHash,bytes32 readingsDigest)"
        );
    bytes32 public constant VERIFIER_APPROVAL_TYPEHASH =
        keccak256(
            "VerifierApproval(bytes32 meterStatement,bytes32 verifiedHash,bytes32 reportHash,uint64 hcsTopicNum,uint64 hcsSequence,bytes32 evidenceHash,uint8 decision)"
        );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private immutable _DOMAIN_SEPARATOR;
    uint256 private immutable _CHAIN_ID;

    struct Project {
        address operator;
        /// @dev secp256k1 key of the data logger. It signs every period's `MeterStatement`.
        address meter;
        IMethodology module;
        bool active;
        uint8 creditingPeriods;
        uint32 attestations;
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
        bytes32 designHash;
        bytes params;
    }

    /// @notice One monitoring period, as relayed by anyone. The signatures are the authorisation.
    struct Submission {
        bytes32 projectId;
        /// @dev Must equal the project's attestation count, so a pair of signatures is usable once.
        uint32 sequence;
        /// @dev Accepted readings and their interval length, as signed by the meter; completeness is computed here.
        uint32 intervals;
        uint32 intervalSeconds;
        /// @dev SHA-256 of the readings batch published on HCS.
        bytes32 readingsDigest;
        bytes32 reportHash;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
        /// @dev Optional external evidence (e.g. a Guardian VC or VP) the VVB relied on; each value is usable once.
        bytes32 evidenceHash;
        Measurement measurement;
        bytes meterSignature;
        bytes verifierSignature;
    }

    struct Attestation {
        bytes32 projectId;
        uint64 periodStart;
        uint64 periodEnd;
        int64 reductionG;
        uint64 unitsMinted;
        uint16 completenessBps;
        address verifier;
        address meter;
        uint64 hcsTopicNum;
        uint64 hcsSequence;
        uint64 timestamp;
        bytes32 reportHash;
        bytes32 readingsDigest;
        bytes32 evidenceHash;
        /// @dev The module-encoded figures the VVB accepted (hydro: `Energy(netWh, grossWh, fuelG, leakageG)`).
        bytes verified;
        /// @dev The module's quantification breakdown, so a reader needs one call to reproduce the period.
        bytes breakdown;
    }

    struct Retirement {
        address account;
        uint64 units;
        uint64 timestamp;
        string beneficiary;
        uint64 certificateSerial;
        bool certificateDelivered;
    }

    /// @notice Reserved Paris Agreement Article 6.2 metadata. Recorded, not enforced: a corresponding adjustment is
    /// applied in the host Party's registry and reports, never by this contract.
    struct Article6 {
        /// @dev ISO 3166-1 alpha-2 code of the host Party, e.g. "NP".
        bytes2 hostParty;
        /// @dev 0 unset, 1 NDC use, 2 other international mitigation purposes (OIMP), 3 both.
        uint8 authorizedUse;
        /// @dev 0 unset, 1 authorization, 2 issuance, 3 use or cancellation (decision 2/CMA.3 annex, first transfer).
        uint8 firstTransferDefinition;
        /// @dev Hash or reference of the host Party's letter of authorization.
        bytes32 authorizationRef;
    }

    address public creditToken;
    address public certificateToken;
    uint16 public minCompletenessBps;
    /// @dev HCS topic attestations must cite. Zero until set; submission reverts until then.
    uint64 public auditTopic;
    uint256 public totalIssuedUnits;
    uint256 public totalRetiredUnits;

    mapping(address account => uint256 units) public custodyBalanceOf;
    mapping(IMethodology module => bool) public approvedModule;
    mapping(address meter => bytes32 projectId) public projectOfMeter;
    mapping(bytes32 designHash => bytes32 projectId) public projectOfDesign;
    /// @notice Evidence hashes already backing an attestation. One external document cannot back two.
    mapping(bytes32 evidenceHash => bool) public evidenceUsed;
    mapping(bytes32 projectId => Article6) public article6Of;
    mapping(address verifier => bytes32 accreditationHash) public verifierProfileOf;
    /// @notice Reserved: host-Party corresponding-adjustment status per attestation (0 none, 1 pending, 2 applied).
    mapping(uint256 attestationId => uint8) public correspondingAdjustmentOf;

    mapping(bytes32 projectId => Project) private _projects;
    bytes32[] private _projectIds;
    Attestation[] private _attestations;
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
        string name,
        address meter,
        bytes32 designHash,
        bytes params
    );
    event CreditingPeriodRenewed(bytes32 indexed projectId, uint64 creditingStart, uint64 creditingEnd, bytes params);
    event ProjectStatusChanged(bytes32 indexed projectId, bool active);
    event MeterChanged(bytes32 indexed projectId, address indexed meter);
    event MinCompletenessChanged(uint16 minCompletenessBps);
    event CalibrationUpdated(bytes32 indexed projectId, uint64 validUntil, bytes32 certificateHash);
    event AuditTopicSet(uint64 topic);
    event VerifierProfileSet(address indexed verifier, bytes32 accreditationHash);
    event Article6Set(
        bytes32 indexed projectId,
        bytes2 hostParty,
        uint8 authorizedUse,
        uint8 firstTransferDefinition,
        bytes32 authorizationRef
    );
    event CorrespondingAdjustmentSet(uint256 indexed attestationId, uint8 status, bytes32 ref);
    event AttestationSubmitted(
        uint256 indexed attestationId,
        bytes32 indexed projectId,
        address indexed verifier,
        int256 reductionG,
        uint256 unitsMinted,
        bytes32 reportHash,
        uint64 hcsTopicNum,
        uint64 hcsSequence,
        bytes32 evidenceHash,
        bytes breakdown
    );
    event MeterStatementAccepted(uint256 indexed attestationId, address indexed meter, bytes32 readingsDigest);
    event CustodyMoved(address indexed from, address indexed to, uint256 units);
    event Withdrawn(address indexed account, uint256 units);
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
    error MeterAlreadyRegistered(address meter);
    error DesignAlreadyRegistered(bytes32 designHash);
    error RegistrationInTheFuture(uint64 requestedAt);
    error InvalidCompleteness(uint16 value);
    error InvalidPeriod(uint64 periodStart, uint64 periodEnd);
    error PeriodOverlapsPrevious(uint64 periodStart, uint64 lastPeriodEnd);
    error OutsideCreditingPeriod(uint64 periodStart, uint64 periodEnd);
    error CalibrationExpired(uint64 periodEnd, uint64 calibrationValidUntil);
    error StaleLedger(uint32 expected, uint32 provided);
    error Unanchored(uint64 topic, uint64 sequence);
    error EmptyReportHash();
    error CompletenessTooLow(uint16 completenessBps, uint16 minCompletenessBps);
    error InvalidMeterSignature(address signer, address meter);
    error UnregisteredVerifier(address signer);
    error VerifierIsParty(address verifier);
    error EvidenceAlreadyUsed(bytes32 evidenceHash);
    error WrongChain(uint256 chainId);
    error ZeroAmount();
    error InsufficientCustody(uint256 requested, uint256 available);
    error BeneficiaryTooLong();
    error NoCertificateToClaim(uint256 retirementId);
    error NotRetirementOwner(uint256 retirementId);
    error InvalidAttestation(uint256 attestationId);
    error NativeTransferFailed();

    /// @param admin Account granted DEFAULT_ADMIN_ROLE. Use a Hedera threshold-key account (e.g. 2-of-3).
    /// @param minCompletenessBps_ Minimum share of a period covered by accepted readings.
    constructor(address admin, uint16 minCompletenessBps_) {
        if (admin == address(0)) revert ZeroAddress();
        if (minCompletenessBps_ > MAX_BPS) revert InvalidCompleteness(minCompletenessBps_);
        _CHAIN_ID = block.chainid;
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("DmrvRegistry"), keccak256("1"), block.chainid, address(this))
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

    /// @notice Registers a project under an approved module. The module validates `params` (applicability,
    /// crediting period, the registration-request date) and returns the terms this contract enforces.
    function registerProject(
        bytes32 projectId,
        string calldata name,
        IMethodology module,
        address operator,
        address meter,
        bytes32 designHash,
        bytes calldata params
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (projectId == bytes32(0) || operator == address(0)) revert InvalidProject(projectId);
        if (meter == address(0)) revert ZeroAddress();
        if (!approvedModule[module]) revert ModuleNotApproved(address(module));
        Project storage p = _projects[projectId];
        if (p.operator != address(0)) revert ProjectAlreadyRegistered(projectId);
        ProjectTerms memory t = module.validateProject(params);
        if (t.registrationRequestedAt > block.timestamp) revert RegistrationInTheFuture(t.registrationRequestedAt);
        _claimDesign(projectId, designHash);
        _claimMeter(projectId, meter);

        p.operator = operator;
        p.meter = meter;
        p.module = module;
        p.active = true;
        p.creditingPeriods = 1;
        _applyTerms(p, t);
        p.designHash = designHash;
        p.params = params;
        _projectIds.push(projectId);
        emit ProjectRegistered(projectId, address(module), operator, name, meter, designHash, params);
        emit MeterChanged(projectId, meter);
    }

    /// @notice Starts the next crediting period. The project's own module decides what may change (the grid
    /// emission factor) and enforces the renewal rules (same span, never after a 10-year period, at most 3).
    /// The module ledger restarts; any ER deficit carries over.
    function renewCreditingPeriod(bytes32 projectId, bytes calldata newParams) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Project storage p = _existing(projectId);
        ProjectTerms memory t = p.module.validateRenewal(
            p.params,
            newParams,
            p.creditingStart,
            p.creditingEnd,
            p.creditingPeriods
        );
        _applyTerms(p, t);
        p.creditingPeriods += 1;
        p.params = newParams;
        p.state = bytes32(0);
        emit CreditingPeriodRenewed(projectId, t.creditingStart, t.creditingEnd, newParams);
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

    function setMinCompleteness(uint16 minCompletenessBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (minCompletenessBps_ > MAX_BPS) revert InvalidCompleteness(minCompletenessBps_);
        minCompletenessBps = minCompletenessBps_;
        emit MinCompletenessChanged(minCompletenessBps_);
    }

    /// @notice Fixes the HCS topic every later attestation must cite. It cannot be cleared.
    function setAuditTopic(uint64 topic) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (topic == 0) revert Unanchored(0, 0);
        auditTopic = topic;
        emit AuditTopicSet(topic);
    }

    /// @notice Links a VVB signing key to its accreditation record (e.g. the hash of its Guardian DID document or
    /// accreditation certificate). Informational; `VERIFIER_ROLE` is what authorises signatures.
    function setVerifierProfile(address verifier, bytes32 accreditationHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        verifierProfileOf[verifier] = accreditationHash;
        emit VerifierProfileSet(verifier, accreditationHash);
    }

    /// @notice Reserved Article 6.2 metadata for a project. Informational only.
    function setArticle6(bytes32 projectId, Article6 calldata a) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _existing(projectId);
        article6Of[projectId] = a;
        emit Article6Set(projectId, a.hostParty, a.authorizedUse, a.firstTransferDefinition, a.authorizationRef);
    }

    /// @notice Reserved: records the host Party's reported corresponding-adjustment status for an issuance.
    function setCorrespondingAdjustment(
        uint256 attestationId,
        uint8 status,
        bytes32 ref
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (attestationId >= _attestations.length) revert InvalidAttestation(attestationId);
        correspondingAdjustmentOf[attestationId] = status;
        emit CorrespondingAdjustmentSet(attestationId, status, ref);
    }

    /// @notice Recovers HBAR left over from HTS creation fees. The registry holds no one else's HBAR.
    function sweepHbar(address payable to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        (bool ok, ) = to.call{ value: address(this).balance }("");
        if (!ok) revert NativeTransferFailed();
    }

    // ─── Verification ────────────────────────────────────────────────────────

    /// @notice Records a monitoring period and mints its credits into the operator's custody. Anyone may relay it:
    /// the meter's signature fixes the raw totals, and a registered VVB's signature over the meter statement's
    /// digest fixes what was accepted. Neither key can mint alone, and the relayer can change nothing.
    function submitAttestation(Submission calldata s) external nonReentrant returns (uint256 attestationId) {
        address token = creditToken;
        if (token == address(0)) revert TokenNotCreated();
        Project storage p = _existing(s.projectId);
        Measurement calldata m = s.measurement;
        uint16 completeness = _checkPeriod(p, s);

        bytes32 meterDigest = meterStatementDigest(s);
        address meterSigner = ECDSA.recover(meterDigest, s.meterSignature);
        if (meterSigner != p.meter) revert InvalidMeterSignature(meterSigner, p.meter);
        address verifier = ECDSA.recover(_approvalDigest(meterDigest, s), s.verifierSignature);
        if (!hasRole(VERIFIER_ROLE, verifier)) revert UnregisteredVerifier(verifier);
        if (verifier == p.operator || verifier == p.meter) revert VerifierIsParty(verifier);
        if (s.evidenceHash != bytes32(0)) {
            if (evidenceUsed[s.evidenceHash]) revert EvidenceAlreadyUsed(s.evidenceHash);
            evidenceUsed[s.evidenceHash] = true;
        }

        QuantResult memory q = p.module.quantify(p.params, p.state, m);
        int256 balance = int256(p.balanceG) + q.reductionG;
        uint256 units = balance > 0 ? uint256(balance) / G_PER_UNIT : 0;
        p.balanceG = int128(balance - int256(units * G_PER_UNIT));
        p.state = q.newState;
        p.attestations += 1;
        p.lastPeriodEnd = m.periodEnd;
        p.issuedUnits += uint128(units);
        totalIssuedUnits += units;

        attestationId = _attestations.length;
        _attestations.push(
            Attestation({
                projectId: s.projectId,
                periodStart: m.periodStart,
                periodEnd: m.periodEnd,
                reductionG: int64(q.reductionG),
                unitsMinted: uint64(units),
                completenessBps: completeness,
                verifier: verifier,
                meter: meterSigner,
                hcsTopicNum: s.hcsTopicNum,
                hcsSequence: s.hcsSequence,
                timestamp: uint64(block.timestamp),
                reportHash: s.reportHash,
                readingsDigest: s.readingsDigest,
                evidenceHash: s.evidenceHash,
                verified: m.verified,
                breakdown: q.breakdown
            })
        );
        if (units > 0) {
            custodyBalanceOf[p.operator] += units;
            HederaTokenLib.mint(token, units);
        }
        emit AttestationSubmitted(
            attestationId,
            s.projectId,
            verifier,
            q.reductionG,
            units,
            s.reportHash,
            s.hcsTopicNum,
            s.hcsSequence,
            s.evidenceHash,
            q.breakdown
        );
        emit MeterStatementAccepted(attestationId, meterSigner, s.readingsDigest);
    }

    /// @notice EIP-712 digest the project's meter signs for a submission.
    function meterStatementDigest(Submission calldata s) public view returns (bytes32) {
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

    /// @notice EIP-712 digest the VVB signs: its approval of exactly this meter statement and these figures.
    function approvalDigest(Submission calldata s) external view returns (bytes32) {
        return _approvalDigest(meterStatementDigest(s), s);
    }

    function domainSeparator() external view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
    }

    /// @notice Quantifies a period against the project's current ledger without recording anything.
    function preview(
        bytes32 projectId,
        Measurement calldata m
    ) external view returns (QuantResult memory q, uint256 units) {
        Project storage p = _existing(projectId);
        q = p.module.quantify(p.params, p.state, m);
        int256 balance = int256(p.balanceG) + q.reductionG;
        units = balance > 0 ? uint256(balance) / G_PER_UNIT : 0;
    }

    // ─── Custody ─────────────────────────────────────────────────────────────

    /// @notice Moves credits from registry custody to the caller's wallet (associate the HTS token first).
    function withdraw(uint256 units) external nonReentrant {
        _debit(msg.sender, units);
        HederaTokenLib.transferFromSelf(creditToken, msg.sender, units);
        emit Withdrawn(msg.sender, units);
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
    function moveCustody(address from, address to, uint256 units) external onlyRole(MARKET_ROLE) {
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
    ) external onlyRole(MARKET_ROLE) nonReentrant returns (uint256) {
        return _retire(account, units, beneficiary);
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

    function getAttestation(uint256 attestationId) external view returns (Attestation memory) {
        return _attestations[attestationId];
    }

    function getAttestations(uint256 start, uint256 count) external view returns (Attestation[] memory page) {
        uint256 end = _pageEnd(start, count, _attestations.length);
        page = new Attestation[](end - start);
        for (uint256 i = start; i < end; i++) page[i - start] = _attestations[i];
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

    function _applyTerms(Project storage p, ProjectTerms memory t) private {
        p.creditingStart = t.creditingStart;
        p.creditingEnd = t.creditingEnd;
        p.calibrationValidUntil = t.calibrationValidUntil;
        p.registrationRequestedAt = t.registrationRequestedAt;
    }

    /// @dev Period, crediting window, calibration, ledger sequence, HCS anchor and completeness. Returns the
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
        if (auditTopic == 0 || s.hcsTopicNum != auditTopic || s.hcsSequence == 0) {
            revert Unanchored(s.hcsTopicNum, s.hcsSequence);
        }
        uint256 span = m.periodEnd - m.periodStart;
        uint256 covered = uint256(s.intervals) * s.intervalSeconds;
        completeness = uint16(((covered < span ? covered : span) * MAX_BPS) / span);
        if (completeness < minCompletenessBps) revert CompletenessTooLow(completeness, minCompletenessBps);
    }

    function _approvalDigest(bytes32 meterDigest, Submission calldata s) private view returns (bytes32) {
        return
            _typedDigest(
                keccak256(
                    abi.encode(
                        VERIFIER_APPROVAL_TYPEHASH,
                        meterDigest,
                        keccak256(s.measurement.verified),
                        s.reportHash,
                        s.hcsTopicNum,
                        s.hcsSequence,
                        s.evidenceHash,
                        DECISION_APPROVED
                    )
                )
            );
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
