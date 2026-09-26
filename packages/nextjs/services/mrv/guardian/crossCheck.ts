import { METHODOLOGY_CODE, PROJECT_TYPE_CODE, type RegisteredDesign } from "../methodology/project";
import { EMPTY_LEDGER, ceilDiv, quantifyPeriod } from "../methodology/quantify";
import type { Decision } from "./resultSchema";

/**
 * Field mapping from the user's Guardian VMR0017 Monitoring Report (schema #e801fa39…, policy p_fc29b2de,
 * `vmr0017_engine` mathBlock) onto our hydro engine (spec §6.3), then an integer recomputation with
 * `quantifyPeriod`, the function the registry mirrors.
 *
 *   field3/4  EF_OM / EF_BM (t CO2/MWh)     field5/6  w_OM / w_BM
 *   field7    EG_PJ (MWh)                    field30   TEG (MWh)
 *   field8/9  hydro / new-or-enlarged reservoir flags
 *   field10/29 A_PJ / A_BL (km²)             field11/28 Cap_PJ / Cap_BL (MW)
 *   field13   EF_Res (kg/MWh)                field44   EF_embodied (g/kWh)
 *   field14/15/16 co-firing flag, fuel (GJ), EF (t CO2/GJ)
 *   field24–27 BE / PE / LE / ER (t) as the policy computed them
 *
 * Scaling to our units: MWh → Wh ×10⁶, t → g ×10⁶, km² → m² ×10⁶, MW → kW ×10³. EF_grid,CM is rounded to whole
 * g/MWh, as it is when a plant registers on-chain.
 */

export const HYDRO_METHODOLOGY_ID = "hydro/acm0002+vmr0017";
/** `HydroVmr0017Module.version()`. */
export const HYDRO_MODULE_VERSION = 1;
/** VMR0017 constants our engine applies (methodology/project.ts). */
const VMR0017_EF_RES_KG_PER_MWH = 100;
const VMR0017_EF_EMBODIED_G_PER_KWH = 21;

export type MonitoringReportSubject = Record<string, unknown>;

export class MappingError extends Error {}

/** Exact decimal scaling of a JSON number. `toFixed` rounds correctly for |x| < 1e21, unlike `x * 1e6`. */
export function scaled(value: number, decimals: number): bigint {
  if (!Number.isFinite(value)) throw new MappingError(`not a finite number: ${value}`);
  if (Math.abs(value) >= 1e15) throw new MappingError(`value out of range: ${value}`);
  const [whole, frac = ""] = Math.abs(value).toFixed(decimals).split(".");
  const magnitude = BigInt(whole + frac.padEnd(decimals, "0"));
  return value < 0 ? -magnitude : magnitude;
}

const gramsToTonnes = (g: bigint) => Number(g) / 1e6;

function num(subject: MonitoringReportSubject, key: string, required: boolean): number {
  const raw = subject[key];
  if (raw === undefined || raw === null || raw === "") {
    if (required) throw new MappingError(`Monitoring Report is missing ${key}`);
    return 0;
  }
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new MappingError(`${key} is not a number`);
  return value;
}

export type CrossCheckOutcome = {
  decision: Decision;
  oursG: { be: bigint; pe: bigint; le: bigint; er: bigint };
  theirsG: { be: bigint; pe: bigint; le: bigint; er: bigint };
  theirsT: { be: number; pe: number; le: number; er: number };
  deltaERg: bigint;
  notes: string[];
};

/** The fields a VMR0017 Monitoring Report must carry for the cross-check (`@context`/`type` aside). */
export const REQUIRED_MR_FIELDS = [
  "field3",
  "field4",
  "field5",
  "field6",
  "field7",
  "field8",
  "field24",
  "field25",
  "field26",
  "field27",
];

/** Non-hydro terms the policy supports and our hydro module does not (§6.2): any non-zero value is out of scope. */
const OUT_OF_SCOPE = [
  "field31",
  "field32",
  "field33",
  "field35",
  "field36",
  "field37",
  "field38",
  "field39",
  "field41",
  "field42",
  "field43",
];

export function crossCheckMonitoringReport(subject: MonitoringReportSubject): CrossCheckOutcome {
  for (const key of REQUIRED_MR_FIELDS) num(subject, key, true);
  const notes: string[] = [];
  const notComparable: string[] = [];

  const theirsT = {
    be: num(subject, "field24", true),
    pe: num(subject, "field25", true),
    le: num(subject, "field26", true),
    er: num(subject, "field27", true),
  };
  const theirsG = {
    be: scaled(theirsT.be, 6),
    pe: scaled(theirsT.pe, 6),
    le: scaled(theirsT.le, 6),
    er: scaled(theirsT.er, 6),
  };

  if (num(subject, "field8", true) !== 1)
    notComparable.push("field8 ≠ 1: not a hydropower report; the hydro module does not apply");
  for (const key of OUT_OF_SCOPE) {
    if (num(subject, key, false) !== 0)
      notComparable.push(`${key} is non-zero: geothermal/BESS/fire-suppression terms are outside the hydro module`);
  }
  const geoType = subject.field34;
  if (typeof geoType === "string" && geoType !== "" && geoType !== "not_geothermal") {
    notComparable.push(`field34 = ${geoType}: geothermal plant type is outside the hydro module`);
  }

  // Grid emission factor: EF_CM = w_OM·EF_OM + w_BM·EF_BM, exactly, then whole g/MWh (half up) as on registration.
  const wOm = scaled(num(subject, "field5", true), 6);
  const wBm = scaled(num(subject, "field6", true), 6);
  if (wOm + wBm !== 1_000_000n) notes.push(`w_OM + w_BM = ${Number(wOm + wBm) / 1e6}, not 1`);
  const efExact = wOm * scaled(num(subject, "field3", true), 6) + wBm * scaled(num(subject, "field4", true), 6); // g/MWh × 1e6
  const efGridGPerMwh = (efExact + 500_000n) / 1_000_000n;
  const efRounded = efExact % 1_000_000n !== 0n;

  // Reservoir: only a new or enlarged reservoir (field9 = 1) enters the power-density rule, as in the policy.
  const reservoir = num(subject, "field9", false) === 1;
  const capacityKw = Number(scaled(num(subject, "field11", false), 3));
  const baselineCapacityKw = Number(scaled(num(subject, "field28", false), 3));
  const areaM2 = reservoir ? Number(scaled(num(subject, "field10", false), 6)) : 0;
  const baselineAreaM2 = reservoir ? Number(scaled(num(subject, "field29", false), 6)) : 0;
  if (reservoir && areaM2 > baselineAreaM2) {
    const addedW = (capacityKw - baselineCapacityKw) * 1_000;
    if (addedW <= 4 * (areaM2 - baselineAreaM2)) {
      notComparable.push(
        "Power density ≤ 4 W/m²: ACM0002 does not apply; our registry refuses the plant, the policy sets PE_HP = 0",
      );
    }
  }
  if (capacityKw > 15_000)
    notComparable.push("Installed capacity above 15 MW: VMR0017 limits hydro to 15 MW and our registry refuses it");
  if (num(subject, "field40", false) !== 0) notComparable.push("field40 flags power density ≤ 4 W/m²");
  if (baselineCapacityKw > 0) {
    notComparable.push(
      "Cap_BL > 0: retrofit or capacity addition. Our EG_PJ needs the historical baseline (EG_historical + σ), which the report does not carry",
    );
  }

  const efRes = num(subject, "field13", false);
  if (reservoir && efRes !== 0 && efRes !== VMR0017_EF_RES_KG_PER_MWH) {
    notes.push(`field13 EF_Res = ${efRes} kg/MWh; VMR0017 §9.1 fixes 100 and our engine applies 100`);
  }
  const efEmbodied = num(subject, "field44", false);
  if (efEmbodied !== VMR0017_EF_EMBODIED_G_PER_KWH) {
    notes.push(`field44 EF_embodied = ${efEmbodied} g/kWh; VMR0017 §9.1 fixes 21 for hydro and our engine applies 21`);
  }

  const netWh = scaled(num(subject, "field7", true), 6);
  const grossWh = scaled(num(subject, "field30", false), 6);
  const design: RegisteredDesign = {
    projectType: PROJECT_TYPE_CODE.greenfield,
    methodology: METHODOLOGY_CODE.VMR0017,
    capacityKw,
    baselineCapacityKw,
    reservoirAreaM2: areaM2,
    baselineReservoirAreaM2: baselineAreaM2,
    efGridGPerMwh: Number(efGridGPerMwh),
    fuelCoefGPerTonne: 0,
    baselineWh: 0,
    baselineEndsAt: 0,
    creditingStart: 0,
    creditingEnd: 365 * 24 * 3_600,
  };
  // One report = one annual period; the ledger starts empty because the policy has no carried balance.
  const q = quantifyPeriod(design, EMPTY_LEDGER, {
    periodStart: 0,
    periodEnd: 1,
    netWh,
    grossWh,
    fuelG: 0n,
    leakageG: 0n,
  });

  // PE_FF from co-firing: the policy records fuel in GJ and t CO2/GJ, not TOOL03 mass × COEF, so it is
  // computed here in integers and rounded up like every project-emission term.
  let fossilG = 0n;
  if (num(subject, "field14", false) === 1) {
    fossilG = ceilDiv(
      scaled(num(subject, "field15", false), 6) * scaled(num(subject, "field16", false), 6),
      1_000_000n,
    );
    if (fossilG > 0n)
      notes.push("PE_FF from field15 (GJ) × field16 (t CO2/GJ); our registry uses TOOL03 fuel mass × COEF");
  }

  const oursG = {
    be: q.baselineG,
    pe: q.reservoirG + q.fossilFuelG + fossilG,
    le: q.leakageG,
    er: 0n,
  };
  const rawEr = oursG.be - oursG.pe - oursG.le;
  oursG.er = rawEr > 0n ? rawEr : 0n;
  if (rawEr < 0n)
    notes.push(
      `Our ER is ${gramsToTonnes(rawEr)} t; the registry carries it forward as a deficit instead of flooring at 0`,
    );

  // Rounding tolerance: 1 g per term, plus half a gram per MWh when EF_CM had to be rounded to whole g/MWh.
  const efSlack = efRounded ? (abs(netWh) + 1_999_999n) / 2_000_000n : 0n;
  const tolerance = { be: 1n + efSlack, pe: 2n, le: 1n };
  const toleranceEr = tolerance.be + tolerance.pe + tolerance.le;
  if (efRounded)
    notes.push(`EF_CM rounded to ${efGridGPerMwh} g/MWh (registration precision); BE tolerance ${tolerance.be} g`);

  const deltaERg = oursG.er - theirsG.er;
  const within =
    abs(oursG.be - theirsG.be) <= tolerance.be &&
    abs(oursG.pe - theirsG.pe) <= tolerance.pe &&
    abs(oursG.le - theirsG.le) <= tolerance.le &&
    abs(deltaERg) <= toleranceEr;

  let decision: Decision;
  if (notComparable.length) decision = "NOT_COMPARABLE";
  else decision = within ? "MATCH" : "MISMATCH";
  if (decision === "MISMATCH") {
    for (const term of ["be", "pe", "le"] as const) {
      const delta = oursG[term] - theirsG[term];
      if (abs(delta) > tolerance[term]) notes.push(`${term.toUpperCase()} differs by ${delta} g`);
    }
  }

  return { decision, oursG, theirsG, theirsT, deltaERg, notes: [...notComparable, ...notes] };
}

const abs = (a: bigint) => (a < 0n ? -a : a);

export const tonnes = gramsToTonnes;
