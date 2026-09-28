// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IMethodology, Measurement, ProjectTerms, QuantResult } from "../interfaces/IMethodology.sol";

/// @title RenewableVmr0017Module
/// @notice Greenfield grid-connected solar, wind and ocean power under CDM ACM0002 / AMS-I.D or Verra VMR0017 v1.0,
/// the second methodology behind `DmrvRegistry`. It shares the hydro module's measurement encoding, ledger word and
/// breakdown layout, so the registry, meter and VVB signatures, HCS reproduction, market and UI need no change.
///
///   BE_y = EG_PJ,y × EF_grid,CM,y                 (ACM0002 eq. 1-2; rounded down)
///   PE_y = PE_FF,y                                (TOOL03; rounded up. Solar, wind and ocean have no PE_HP or PE_GP)
///   LE_y = EG_facility,y × EF_embodied × 10⁻³     (VMR0017 §8.3 eq. 19, greenfield; rounded up; CDM: 0)
///   ER_y = BE_y − PE_y − LE_y                     (VMR0017 §8.4 eq. 17)
///
/// EF_embodied (VMR0017 §9.1, NREL 2021): solar PV 43, wind 13, ocean energy 8 g CO2e/kWh.
/// Applicability (VMR0017 §4, Table 1, which supersedes the VCS default eligibility): wind and solar at any capacity
/// in low-, lower-middle- and upper-middle-income countries only; wave and tidal everywhere. Geothermal (PE_GP),
/// BESS and capacity additions or retrofits are out of scope for this version.
/// @dev Ledger word, big-endian: `uint32 creditingYear | int112 yearNetWh | int112 balanceG`, as in the hydro module.
contract RenewableVmr0017Module is IMethodology {
    uint256 public constant CREDITING_YEAR = 365 days;
    uint64 public constant VCS_FIVE_YEAR_FROM = 1_798_761_600;
    uint32 public constant MAX_GRID_EF_G_PER_MWH = 2_000_000;
    uint32 public constant EMBODIED_SOLAR_G_PER_MWH = 43_000;
    uint32 public constant EMBODIED_WIND_G_PER_MWH = 13_000;
    uint32 public constant EMBODIED_OCEAN_G_PER_MWH = 8_000;
    uint256 private constant WH_PER_MWH = 1e6;
    uint256 private constant G_PER_TONNE = 1e6;
    uint256 private constant G_PER_UNIT = 1_000;

    uint8 private constant CDM = 0;
    uint8 private constant VMR = 1;

    uint8 public constant SOLAR_PV = 0;
    uint8 public constant FLOATING_SOLAR = 1;
    uint8 public constant WIND_ONSHORE = 2;
    uint8 public constant WIND_OFFSHORE = 3;
    uint8 public constant WAVE = 4;
    uint8 public constant TIDAL = 5;

    /// @dev World Bank income classification of the host country (VMR0017 Table 1, footnote 1).
    uint8 public constant HIGH_INCOME = 3;

    struct RenewableParams {
        uint8 methodology;
        uint8 technology;
        uint8 incomeGroup;
        uint32 capacityKw;
        uint32 efGridGPerMwh;
        uint32 fuelCoefGPerTonne;
        uint64 creditingStart;
        uint64 creditingEnd;
        uint64 registrationRequestedAt;
        uint64 calibrationValidUntil;
        bytes32 meteringHash;
        bytes32 designHash;
    }

    /// @dev Same layout as the hydro module's, so meters and VVBs sign the same bytes for any technology.
    struct Energy {
        int64 netWh;
        uint64 grossWh;
        uint64 fuelG;
        uint64 leakageG;
    }

    error InvalidParams();
    error MissingRegistrationRequest();
    error MissingCalibration();
    error RegistrationInTheFuture(uint64 requestedAt);
    error GridEmissionFactorOutOfRange(uint32 ef);
    error InvalidCreditingPeriod(uint64 start, uint64 end);
    error NotApplicableInHighIncomeCountry(uint8 technology);
    error NotRenewable();
    error RenewalOverlap();
    error RenewalSpan();
    error ParamsChanged();
    error StateOverflow();
    error NotMetered();
    error EnergyExceedsCapacity(uint64 grossWh, uint256 maxWh);
    error NetExceedsGross(int64 netWh, uint64 grossWh);
    error FuelNotRegistered();
    error PeriodCrossesCreditingYear(uint64 periodStart, uint64 periodEnd);

    function methodologyId() external pure returns (bytes32) {
        return keccak256("renewable/acm0002+vmr0017");
    }

    function version() external pure returns (uint32) {
        return 1;
    }

    function schemaHash() external pure returns (bytes32) {
        return
            keccak256(
                "RenewableParams(uint8,uint8,uint8,uint32,uint32,uint32,uint64,uint64,uint64,uint64,bytes32,bytes32)Energy(int64,uint64,uint64,uint64)"
            );
    }

    function validateProject(bytes calldata params) external view returns (ProjectTerms memory terms) {
        RenewableParams memory p = abi.decode(params, (RenewableParams));
        _checkDesign(p);
        if (p.registrationRequestedAt == 0) revert MissingRegistrationRequest();
        if (p.calibrationValidUntil <= p.creditingStart) revert MissingCalibration();
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

    /// @notice A renewal never follows a 10-year period and may update only the grid factor, crediting dates and
    /// calibration (VCS Standard: baseline reassessed at renewal). It repeats the previous span, except that a VMR0017
    /// renewal from 1 Jan 2027 is 5 years (VCS Standard v5.0, V5#101). The block time stands in for the request date:
    /// a renewal is registered after it is requested, so the proxy can only shorten a period.
    function validateRenewal(
        bytes calldata oldParams,
        bytes calldata newParams,
        uint64 prevStart,
        uint64 prevEnd,
        uint8 periods
    ) external view returns (ProjectTerms memory) {
        RenewableParams memory oldP = abi.decode(oldParams, (RenewableParams));
        RenewableParams memory newP = abi.decode(newParams, (RenewableParams));
        uint256 prevSpan = uint256(prevEnd) - prevStart;
        if (prevSpan == 10 * CREDITING_YEAR || periods >= 3) revert NotRenewable();
        if (newP.creditingStart < prevEnd) revert RenewalOverlap();
        uint256 span = newP.methodology == VMR && block.timestamp >= VCS_FIVE_YEAR_FROM ? 5 * CREDITING_YEAR : prevSpan;
        if (uint256(newP.creditingEnd) - newP.creditingStart != span) revert RenewalSpan();
        if (
            newP.registrationRequestedAt != oldP.registrationRequestedAt ||
            newP.methodology != oldP.methodology ||
            newP.technology != oldP.technology ||
            newP.incomeGroup != oldP.incomeGroup ||
            newP.capacityKw != oldP.capacityKw ||
            newP.fuelCoefGPerTonne != oldP.fuelCoefGPerTonne ||
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
        RenewableParams memory p = abi.decode(params, (RenewableParams));
        Energy memory energy = abi.decode(m.verified, (Energy));
        _checkMeasurement(p, m, energy, abi.decode(m.metered, (Energy)));
        (uint32 year, int256 yearBefore, int256 balanceBefore) = _unpack(state);

        uint32 creditingYear = uint32((m.periodStart - p.creditingStart) / CREDITING_YEAR);
        int256 yearNet = (creditingYear == year ? yearBefore : int256(0)) + energy.netWh;

        // Greenfield: EG_PJ = EG_facility, the net export (negative when the plant imports more than it exports).
        int256 projectWh = energy.netWh;
        int256 baselineG = _floorDiv(projectWh * int256(uint256(p.efGridGPerMwh)), WH_PER_MWH);
        uint256 fossilG = _ceilDiv(uint256(energy.fuelG) * p.fuelCoefGPerTonne, G_PER_TONNE);
        uint256 leakageG = uint256(energy.leakageG) +
            _ceilDiv(uint256(_positive(projectWh)) * embodiedRate(p.methodology, p.technology), WH_PER_MWH);
        int256 reductionG = baselineG - int256(fossilG) - int256(leakageG);

        int256 balance = balanceBefore + reductionG;
        uint256 units = balance > 0 ? uint256(balance) / G_PER_UNIT : 0;
        int256 balanceAfter = balance - int256(units * G_PER_UNIT);

        result.reductionG = reductionG;
        result.newState = _pack(creditingYear, yearNet, balanceAfter);
        // Same nine fields as the hydro module; reservoir emissions are always zero here.
        result.breakdown = abi.encode(
            creditingYear,
            projectWh,
            baselineG,
            uint256(0),
            fossilG,
            leakageG,
            reductionG,
            units,
            balanceAfter
        );
    }

    /// @notice EF_embodied in g CO2e per MWh (VMR0017 §9.1); zero under CDM ACM0002 / AMS-I.D.
    function embodiedRate(uint8 methodology, uint8 technology) public pure returns (uint32) {
        if (methodology != VMR) return 0;
        if (technology <= FLOATING_SOLAR) return EMBODIED_SOLAR_G_PER_MWH;
        if (technology <= WIND_OFFSHORE) return EMBODIED_WIND_G_PER_MWH;
        return EMBODIED_OCEAN_G_PER_MWH;
    }

    function describe(bytes calldata params) external pure returns (string memory) {
        RenewableParams memory p = abi.decode(params, (RenewableParams));
        return
            string.concat(
                '{"id":"renewable/acm0002+vmr0017","version":1,"methodology":',
                p.methodology == VMR ? '"VMR0017"' : '"CDM"',
                ',"technology":',
                _utoa(p.technology),
                ',"capacityKw":',
                _utoa(p.capacityKw),
                ',"efGridGPerMwh":',
                _utoa(p.efGridGPerMwh),
                "}"
            );
    }

    /// @dev As in the hydro module: the VVB may only lower net export, raise fuel and leakage, and must cap gross at
    /// what the nameplate can produce in the period.
    function _checkMeasurement(
        RenewableParams memory p,
        Measurement calldata m,
        Energy memory v,
        Energy memory metered
    ) private pure {
        if (m.periodStart < p.creditingStart || m.periodEnd <= m.periodStart) {
            revert PeriodCrossesCreditingYear(m.periodStart, m.periodEnd);
        }
        if (
            (m.periodStart - p.creditingStart) / CREDITING_YEAR != (m.periodEnd - 1 - p.creditingStart) / CREDITING_YEAR
        ) {
            revert PeriodCrossesCreditingYear(m.periodStart, m.periodEnd);
        }
        uint256 maxWh = (uint256(p.capacityKw) * (m.periodEnd - m.periodStart) * 1_000) / 3_600;
        if (v.grossWh > maxWh) revert EnergyExceedsCapacity(v.grossWh, maxWh);
        if (v.netWh > 0 && uint64(v.netWh) > v.grossWh) revert NetExceedsGross(v.netWh, v.grossWh);
        if (v.fuelG > 0 && p.fuelCoefGPerTonne == 0) revert FuelNotRegistered();
        uint256 cappedGross = metered.grossWh < maxWh ? metered.grossWh : maxWh;
        if (
            v.netWh > metered.netWh ||
            v.fuelG < metered.fuelG ||
            v.leakageG < metered.leakageG ||
            v.grossWh != cappedGross
        ) revert NotMetered();
    }

    function _checkDesign(RenewableParams memory p) private pure {
        if (p.methodology > VMR || p.technology > TIDAL || p.incomeGroup > HIGH_INCOME) revert InvalidParams();
        if (p.capacityKw == 0) revert InvalidParams();
        if (p.efGridGPerMwh == 0 || p.efGridGPerMwh > MAX_GRID_EF_G_PER_MWH) {
            revert GridEmissionFactorOutOfRange(p.efGridGPerMwh);
        }
        if (p.methodology == VMR && p.technology <= WIND_OFFSHORE && p.incomeGroup == HIGH_INCOME) {
            revert NotApplicableInHighIncomeCountry(p.technology);
        }
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
