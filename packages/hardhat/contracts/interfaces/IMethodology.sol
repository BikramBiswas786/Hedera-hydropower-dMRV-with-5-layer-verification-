// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice What a methodology returns at registration. The registry stores the module address, not these rules.
struct ProjectTerms {
    uint64 creditingStart;
    uint64 creditingEnd;
    /// @dev Nameplate, in Wh per second, rounded up. The registry rejects a metered rate above this.
    uint64 maxQuantityPerSecond;
    uint64 calibrationValidUntil;
    /// @dev VCS v5 keys the 5-year rule on this instant, not on the crediting start.
    uint64 registrationRequestedAt;
}

/// @notice One monitoring period. `metered` is what the device signed. `verified` is what the VVB accepted.
/// The module quantifies `verified`. The registry rejects a verified figure that is more generous than `metered`.
struct Measurement {
    uint64 periodStart;
    uint64 periodEnd;
    bytes metered;
    bytes verified;
}

/// @notice `reductionG` is ER in grams, signed. `newState` is the module's whole ledger for the next period.
struct QuantResult {
    int256 reductionG;
    bytes32 newState;
    bytes breakdown;
}

/// @title IMethodology
/// @notice A stateless rule set. The registry calls it with STATICCALL. A module must not call HTS or write storage.
/// A project stores the module address it registered under and keeps that address for life.
interface IMethodology {
    function methodologyId() external pure returns (bytes32);

    function version() external pure returns (uint32);

    /// @notice keccak256 of the params and measurement ABI layouts. Bump `version` when this changes.
    function schemaHash() external pure returns (bytes32);

    function validateProject(bytes calldata params) external view returns (ProjectTerms memory);

    function validateRenewal(
        bytes calldata oldParams,
        bytes calldata newParams,
        uint64 prevStart,
        uint64 prevEnd,
        uint8 periods
    ) external view returns (ProjectTerms memory);

    function quantify(
        bytes calldata params,
        bytes32 state,
        Measurement calldata m
    ) external view returns (QuantResult memory);

    function describe(bytes calldata params) external view returns (string memory json);
}
