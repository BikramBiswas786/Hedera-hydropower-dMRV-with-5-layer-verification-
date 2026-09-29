// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

interface IDmrvRegistryCounts {
    function issuanceCount() external view returns (uint256);

    function getProjectIds() external view returns (bytes32[] memory);
}

/// @title DmrvAnnotations
/// @notice Records about a `DmrvRegistry`'s projects and issuances that nothing on-chain enforces: a VVB's
/// accreditation record, Paris Agreement Article 6.2 authorization, the host Party's corresponding-adjustment status
/// and the Verra VCU serial range an issuance corresponds to. Kept outside the registry so issuance code stays small
/// and so no reader mistakes a note for a rule. The Verra registry, the host Party and the accreditation body stay the
/// sources of truth for what these fields say.
contract DmrvAnnotations is AccessControl {
    /// @notice Paris Agreement Article 6.2 metadata for a project.
    struct Article6 {
        /// @dev ISO 3166-1 alpha-2 code of the host Party, e.g. "UG".
        bytes2 hostParty;
        /// @dev 0 unset, 1 NDC use, 2 other international mitigation purposes (OIMP), 3 both.
        uint8 authorizedUse;
        /// @dev 0 unset, 1 authorization, 2 issuance, 3 use or cancellation (decision 2/CMA.3 annex, first transfer).
        uint8 firstTransferDefinition;
        /// @dev Hash or reference of the host Party's letter of authorization.
        bytes32 authorizationRef;
    }

    IDmrvRegistryCounts public immutable REGISTRY;

    mapping(address verifier => bytes32 accreditationHash) public verifierProfileOf;
    mapping(bytes32 projectId => Article6) public article6Of;
    /// @notice 0 none, 1 pending, 2 applied, as the host Party reports it.
    mapping(uint256 issuanceId => uint8) public correspondingAdjustmentOf;
    /// @notice Hash (or packed reference) of the Verra VCU serial range matching an issuance; zero when none.
    mapping(uint256 issuanceId => bytes32) public vcuReferenceOf;

    event VerifierProfileSet(address indexed verifier, bytes32 accreditationHash);
    event Article6Set(
        bytes32 indexed projectId,
        bytes2 hostParty,
        uint8 authorizedUse,
        uint8 firstTransferDefinition,
        bytes32 authorizationRef
    );
    event CorrespondingAdjustmentSet(uint256 indexed issuanceId, uint8 status, bytes32 ref);
    event VcuReferenceSet(uint256 indexed issuanceId, bytes32 vcuReference);

    error ZeroAddress();
    error UnknownProject(bytes32 projectId);
    error UnknownIssuance(uint256 issuanceId);
    error InvalidStatus(uint8 status);

    constructor(address admin, IDmrvRegistryCounts registry) {
        if (admin == address(0) || address(registry) == address(0)) revert ZeroAddress();
        REGISTRY = registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Links a VVB signing key to its accreditation record (e.g. the hash of its accreditation certificate).
    function setVerifierProfile(address verifier, bytes32 accreditationHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        verifierProfileOf[verifier] = accreditationHash;
        emit VerifierProfileSet(verifier, accreditationHash);
    }

    function setArticle6(bytes32 projectId, Article6 calldata a) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_isProject(projectId)) revert UnknownProject(projectId);
        if (a.authorizedUse > 3 || a.firstTransferDefinition > 3) revert InvalidStatus(a.authorizedUse);
        article6Of[projectId] = a;
        emit Article6Set(projectId, a.hostParty, a.authorizedUse, a.firstTransferDefinition, a.authorizationRef);
    }

    function setCorrespondingAdjustment(
        uint256 issuanceId,
        uint8 status,
        bytes32 ref
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (issuanceId >= REGISTRY.issuanceCount()) revert UnknownIssuance(issuanceId);
        if (status > 2) revert InvalidStatus(status);
        correspondingAdjustmentOf[issuanceId] = status;
        emit CorrespondingAdjustmentSet(issuanceId, status, ref);
    }

    function setVcuReference(uint256 issuanceId, bytes32 vcuReference) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (issuanceId >= REGISTRY.issuanceCount()) revert UnknownIssuance(issuanceId);
        vcuReferenceOf[issuanceId] = vcuReference;
        emit VcuReferenceSet(issuanceId, vcuReference);
    }

    function _isProject(bytes32 projectId) private view returns (bool) {
        bytes32[] memory ids = REGISTRY.getProjectIds();
        for (uint256 i = 0; i < ids.length; i++) if (ids[i] == projectId) return true;
        return false;
    }
}
