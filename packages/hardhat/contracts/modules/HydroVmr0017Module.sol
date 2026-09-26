// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IMethodology, Measurement, ProjectTerms, QuantResult } from "../interfaces/IMethodology.sol";

/// @title HydroVmr0017Module
/// @notice ACM0002 / AMS-I.D and VMR0017 v1.0 quantification, moved out of `HydroCreditRegistry` so the registry
/// can stay under Hedera's size limit. The arithmetic is the registry's: baseline rounds down, project emissions
/// round up. This contract is not wired into the live registry yet. `HydroCreditRegistry` remains the issuer.
/// @dev Ledger word, big-endian: `uint32 creditingYear | int112 yearNetWh | int112 balanceG`.
contract HydroVmr0017Module is IMethodology {
    uint256 public constant CREDITING_YEAR = 365 days;
    uint64 public constant VCS_FIVE_YEAR_FROM = 1_798_761_600;
    uint32 public constant RESERVOIR_EF_G_PER_MWH = 90_000;
    uint32 public constant VMR0017_RESERVOIR_EF_G_PER_MWH = 100_000;
    uint32 public constant VMR0017_EMBODIED_HYDRO_G_PER_MWH = 21_000;
    uint32 public constant VMR0017_MAX_HYDRO_KW = 15_000;
    uint256 public constant MIN_POWER_DENSITY = 4;
    uint256 public constant RESERVOIR_EMISSIONS_POWER_DENSITY = 10;
    uint32 public constant MAX_GRID_EF_G_PER_MWH = 2_000_000;
    uint256 private constant WH_PER_MWH = 1e6;
    uint256 private constant G_PER_TONNE = 1e6;
    uint256 private constant G_PER_UNIT = 1_000;

    uint8 private constant CDM = 0;
    uint8 private constant VMR = 1;
    uint8 private constant GREENFIELD = 0;
    uint8 private constant RETROFIT = 1;
    uint8 private constant CAPACITY_ADDITION = 2;

    struct HydroParams {
        uint8 projectType;
        uint8 methodology;
        uint32 capacityKw;
        uint32 baselineCapacityKw;
        uint64 reservoirAreaM2;
        uint64 baselineReservoirAreaM2;
        uint32 efGridGPerMwh;
        uint32 fuelCoefGPerTonne;
        uint64 baselineWh;
        uint64 baselineEndsAt;
        uint64 creditingStart;
        uint64 creditingEnd;
        uint64 registrationRequestedAt;
        uint64 calibrationValidUntil;
        bytes32 meteringHash;
        bytes32 designHash;
    }

    /// @dev Verified (and metered) energy for one period. Leakage here is only the amount the VVB added.
    struct Energy {
        int64 netWh;
        uint64 grossWh;
        uint64 fuelG;
        uint64 leakageG;
    }

    error InvalidParams();
    error MissingRegistrationRequest();
    error RegistrationInTheFuture(uint64 requestedAt);
    error GridEmissionFactorOutOfRange(uint32 ef);
    error InvalidCreditingPeriod(uint64 start, uint64 end);
    error InvalidBaseline();
    error ReservoirBelowBaseline();
    error PowerDensityTooLow(uint256 addedW, uint256 addedArea);
    error MethodologyNotApplicable(uint32 capacityKw);
    error NotRenewable();
    error RenewalOverlap();
    error RenewalSpan();
    error ParamsChanged();
    error StateOverflow();

    function methodologyId() external pure returns (bytes32) {
        return keccak256("hydro/acm0002+vmr0017");
    }

    function version() external pure returns (uint32) {
        return 1;
    }

    function schemaHash() external pure returns (bytes32) {
        return
            keccak256(
                "HydroParams(uint8,uint8,uint32,uint32,uint64,uint64,uint32,uint32,uint64,uint64,uint64,uint64,uint64,uint64,bytes32,bytes32)Energy(int64,uint64,uint64,uint64)"
            );
    }

    function validateProject(bytes calldata params) external view returns (ProjectTerms memory terms) {
        HydroParams memory p = abi.decode(params, (HydroParams));
        _checkDesign(p);
        if (p.registrationRequestedAt == 0) revert MissingRegistrationRequest();
        if (p.registrationRequestedAt > block.timestamp) revert RegistrationInTheFuture(p.registrationRequestedAt);
        _checkSpan(p.methodology, p.registrationRequestedAt, p.creditingStart, p.creditingEnd);
        terms = ProjectTerms({
            creditingStart: p.creditingStart,
            creditingEnd: p.creditingEnd,
            maxQuantityPerSecond: uint64((uint256(p.capacityKw) * 1_000 + 3_599) / 3_600),
            calibrationValidUntil: p.calibrationValidUntil,
            registrationRequestedAt: p.registrationRequestedAt
        });
    }

    function validateRenewal(
        bytes calldata oldParams,
        bytes calldata newParams,
        uint64 prevStart,
        uint64 prevEnd,
        uint8 periods
    ) external view returns (ProjectTerms memory) {
        HydroParams memory oldP = abi.decode(oldParams, (HydroParams));
        HydroParams memory newP = abi.decode(newParams, (HydroParams));
        uint256 prevSpan = uint256(prevEnd) - prevStart;
        if (prevSpan == 10 * CREDITING_YEAR || periods >= 3) revert NotRenewable();
        if (newP.creditingStart < prevEnd) revert RenewalOverlap();
        if (uint256(newP.creditingEnd) - newP.creditingStart != prevSpan) revert RenewalSpan();
        if (
            newP.registrationRequestedAt != oldP.registrationRequestedAt ||
            newP.projectType != oldP.projectType ||
            newP.methodology != oldP.methodology ||
            newP.capacityKw != oldP.capacityKw ||
            newP.baselineCapacityKw != oldP.baselineCapacityKw ||
            newP.reservoirAreaM2 != oldP.reservoirAreaM2 ||
            newP.baselineReservoirAreaM2 != oldP.baselineReservoirAreaM2 ||
            newP.fuelCoefGPerTonne != oldP.fuelCoefGPerTonne ||
            newP.baselineWh != oldP.baselineWh ||
            newP.baselineEndsAt != oldP.baselineEndsAt ||
            newP.meteringHash != oldP.meteringHash ||
            newP.designHash != oldP.designHash
        ) revert ParamsChanged();
        return this.validateProject(newParams);
    }

    function quantify(
        bytes calldata params,
        bytes32 state,
        Measurement calldata m
    ) external pure returns (QuantResult memory result) {
        HydroParams memory p = abi.decode(params, (HydroParams));
        Energy memory energy = abi.decode(m.verified, (Energy));
        (uint32 year, int256 yearBefore, int256 balanceBefore) = _unpack(state);

        uint32 creditingYear = uint32((m.periodStart - p.creditingStart) / CREDITING_YEAR);
        int256 yearNet = (creditingYear == year ? yearBefore : int256(0)) + energy.netWh;
        int256 carried = creditingYear == year ? yearBefore : int256(0);

        int256 projectWh;
        if (p.projectType == GREENFIELD) {
            projectWh = energy.netWh;
        } else if (p.baselineEndsAt != 0 && m.periodEnd > p.baselineEndsAt) {
            projectWh = 0;
        } else {
            int256 baseline = int256(uint256(p.baselineWh));
            projectWh = _positive(yearNet - baseline) - _positive(carried - baseline);
        }

        int256 baselineG = _floorDiv(projectWh * int256(uint256(p.efGridGPerMwh)), WH_PER_MWH);
        (uint32 reservoirRate, uint32 embodiedRate) = _rates(p);
        uint256 reservoirG = _ceilDiv(uint256(energy.grossWh) * reservoirRate, WH_PER_MWH);
        uint256 fossilG = _ceilDiv(uint256(energy.fuelG) * p.fuelCoefGPerTonne, G_PER_TONNE);

        int256 embodiedBasis;
        if (p.projectType == GREENFIELD) embodiedBasis = energy.netWh;
        else if (p.projectType == CAPACITY_ADDITION) {
            embodiedBasis = int256(_capacityAdditionWh(p.capacityKw, p.baselineCapacityKw, energy.netWh, projectWh));
        }
        uint256 leakageG = uint256(energy.leakageG) +
            _ceilDiv(uint256(_positive(embodiedBasis)) * embodiedRate, WH_PER_MWH);
        int256 reductionG = baselineG - int256(reservoirG) - int256(fossilG) - int256(leakageG);

        int256 balance = balanceBefore + reductionG;
        uint256 units = balance > 0 ? uint256(balance) / G_PER_UNIT : 0;
        int256 balanceAfter = balance - int256(units * G_PER_UNIT);

        result.reductionG = reductionG;
        result.newState = _pack(creditingYear, yearNet, balanceAfter);
        result.breakdown = abi.encode(
            creditingYear,
            projectWh,
            baselineG,
            reservoirG,
            fossilG,
            leakageG,
            reductionG,
            units,
            balanceAfter
        );
    }

    function describe(bytes calldata params) external pure returns (string memory) {
        HydroParams memory p = abi.decode(params, (HydroParams));
        return
            string.concat(
                '{"id":"hydro/acm0002+vmr0017","version":1,"methodology":',
                p.methodology == VMR ? '"VMR0017"' : '"CDM"',
                ',"efGridGPerMwh":',
                _utoa(p.efGridGPerMwh),
                "}"
            );
    }

    function _checkDesign(HydroParams memory p) private pure {
        if (p.projectType > CAPACITY_ADDITION || p.methodology > VMR) revert InvalidParams();
        if (p.capacityKw == 0) revert InvalidBaseline();
        if (p.methodology == VMR && p.capacityKw > VMR0017_MAX_HYDRO_KW) revert MethodologyNotApplicable(p.capacityKw);
        if (p.efGridGPerMwh == 0 || p.efGridGPerMwh > MAX_GRID_EF_G_PER_MWH) {
            revert GridEmissionFactorOutOfRange(p.efGridGPerMwh);
        }
        if (p.projectType == GREENFIELD) {
            if (p.baselineCapacityKw != 0 || p.baselineWh != 0 || p.baselineEndsAt != 0) revert InvalidBaseline();
        } else if (
            p.baselineCapacityKw == 0 ||
            p.baselineWh == 0 ||
            p.baselineEndsAt == 0 ||
            (p.projectType == CAPACITY_ADDITION && p.capacityKw <= p.baselineCapacityKw)
        ) {
            revert InvalidBaseline();
        }
        if (p.reservoirAreaM2 < p.baselineReservoirAreaM2) revert ReservoirBelowBaseline();
        (uint256 addedW, uint256 addedArea, ) = _density(p);
        if (addedArea != 0 && addedW <= MIN_POWER_DENSITY * addedArea) revert PowerDensityTooLow(addedW, addedArea);
    }

    /// @dev A VMR0017 period requested on or after 1 Jan 2027 is exactly 5 × 365 days. Earlier requests may be 5, 7 or 10.
    function _checkSpan(uint8 methodology, uint64 requestedAt, uint64 start, uint64 end) private pure {
        if (end <= start) revert InvalidCreditingPeriod(start, end);
        uint256 span = uint256(end) - start;
        bool five = span == 5 * CREDITING_YEAR;
        bool seven = span == 7 * CREDITING_YEAR;
        bool ten = span == 10 * CREDITING_YEAR;
        if ((!five && !seven && !ten) || (methodology == VMR && requestedAt >= VCS_FIVE_YEAR_FROM && !five)) {
            revert InvalidCreditingPeriod(start, end);
        }
    }

    function _rates(HydroParams memory p) private pure returns (uint32 reservoir, uint32 embodied) {
        embodied = p.methodology == VMR ? VMR0017_EMBODIED_HYDRO_G_PER_MWH : 0;
        (uint256 addedW, uint256 addedArea, bool aboveTen) = _density(p);
        if (addedArea == 0 || aboveTen) return (0, embodied);
        if (addedW <= MIN_POWER_DENSITY * addedArea) return (0, embodied);
        reservoir = p.methodology == VMR ? VMR0017_RESERVOIR_EF_G_PER_MWH : RESERVOIR_EF_G_PER_MWH;
    }

    function _density(HydroParams memory p) private pure returns (uint256 addedW, uint256 addedArea, bool aboveTen) {
        addedArea = p.reservoirAreaM2 - p.baselineReservoirAreaM2;
        addedW = p.capacityKw > p.baselineCapacityKw ? (uint256(p.capacityKw) - p.baselineCapacityKw) * 1_000 : 0;
        aboveTen = addedArea != 0 && addedW > RESERVOIR_EMISSIONS_POWER_DENSITY * addedArea;
    }

    function _capacityAdditionWh(
        uint32 capacityKw,
        uint32 baselineKw,
        int64 netWh,
        int256 projectWh
    ) private pure returns (uint256) {
        uint256 facility = uint256(_positive(netWh));
        uint256 added = capacityKw > baselineKw ? uint256(capacityKw) - baselineKw : 0;
        uint256 share = capacityKw == 0 ? 0 : (facility * added) / capacityKw;
        uint256 project = uint256(_positive(projectWh));
        return share > project ? share : project;
    }

    function _pack(uint32 year, int256 yearNet, int256 balance) private pure returns (bytes32) {
        if (yearNet > type(int112).max || yearNet < type(int112).min) revert StateOverflow();
        if (balance > type(int112).max || balance < type(int112).min) revert StateOverflow();
        uint256 word = (uint256(year) << 224) |
            (uint256(uint112(int112(yearNet))) << 112) |
            uint256(uint112(int112(balance)));
        return bytes32(word);
    }

    function _unpack(bytes32 state) private pure returns (uint32 year, int256 yearNet, int256 balance) {
        uint256 word = uint256(state);
        year = uint32(word >> 224);
        yearNet = int256(int112(uint112(word >> 112)));
        balance = int256(int112(uint112(word)));
    }

    function _floorDiv(int256 a, uint256 b) private pure returns (int256 q) {
        q = a / int256(b);
        if (a < 0 && a % int256(b) != 0) q -= 1;
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        if (a == 0) return 0;
        return (a + b - 1) / b;
    }

    function _positive(int256 a) private pure returns (int256) {
        return a > 0 ? a : int256(0);
    }

    function _utoa(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 length;
        for (uint256 v = value; v != 0; v /= 10) length++;
        bytes memory digits = new bytes(length);
        for (; value != 0; value /= 10) digits[--length] = bytes1(uint8(48 + (value % 10)));
        return string(digits);
    }
}
