/**
 * VMR0015 v1.0 (revision of CDM AMS-III.AV) as encoded in the project policy's monitoring math block.
 *
 *   QPW is capped at 5.5 L/person/day (AMS-III.AV para 18).
 *   Option 2.2: QPW_y = population × min(litres/person/day, 5.5) × 365.
 *   TOOL30 project-specific fNRB is discounted 26% (× 0.74), VMR0015 §9.2.
 *   SEC = 357.48 / n_wb  (kJ per litre, divided by baseline stove efficiency).
 *   BE_y = QPW × m × X_boil × SEC × (BL × ((EF_CO2 × fNRB) + EF_nonCO2) × Adj_LE) / 1e9
 *          then × (1 − public-network share) when a public network is installed.
 *   PE_y = residual fuel × days × coefficient + electricity × grid factor × (1 + TDL) / 1000.
 *   LE_y = 0. Leakage sits inside BE through Adj_LE (VMR0015 §8.3).
 *   ER_y = max((BE − PE − LE) × water-quality gate, 0).
 *   The gate is 1 only when at least 90% of tested appliances pass; otherwise nothing is issued.
 *   A REDD+ clearance flag is required by the policy before any reduction is counted.
 *   Issuance is the result rounded down to a whole tonne.
 *
 * These are not Verra credits. The hydro contract does not mint them.
 */

export type QpwMethod = "direct" | "capacity" | "population";
export type FnrBPathway = "TOOL33" | "TOOL30";

export type WaterInputs = {
  projectId: string;
  population: number;
  /** Option 2.2 litres per person per day, before the 5.5 cap. */
  litresPerPersonDay: number;
  /** 0 direct sum, 1 capacity × hours, 2 population equation. */
  qpwMethod?: QpwMethod;
  directLitres?: number;
  deviceCapacityLph?: number;
  deviceUsageHoursYear?: number;
  xBoil: number;
  /** Baseline water-boiling efficiency. SEC = 357.48 / n_wb. */
  stoveEfficiency: number;
  baselineFuelShare: number;
  efCo2TonnesPerTj: number;
  efNonCo2TonnesPerTj: number;
  adjLe: number;
  fnrbPathway: FnrBPathway;
  fnrbDefault?: number;
  tool30Nrb?: number;
  tool30Rb?: number;
  appliancesPassed: number;
  appliancesTested: number;
  monitoringDays: number;
  residualFuelKgPerDay?: number;
  residualFuelCoef?: number;
  gridKwhPerDay?: number;
  gridEfTonnesPerMwh?: number;
  tdl?: number;
  publicNetworkInstalled?: boolean;
  publicNetworkShare?: number;
  reddCleared?: boolean;
  /** Extra fuel-type terms, default 0. */
  extraFuelTerm?: number;
};

export type WaterResult = {
  methodology: "VMR0015 v1.0";
  projectId: string;
  qpwLitres: number;
  capLitres: number;
  capBinding: boolean;
  fnrb: number;
  secKjPerLitre: number;
  waterQualityGate: 0 | 1;
  compliance: number;
  baselineT: number;
  projectT: number;
  leakageT: number;
  reductionT: number;
  creditsTonnes: number;
  trace: string[];
};

const KJ_TO_BOIL = 357.48;
const TOOL30_DISCOUNT = 0.74;
const CAP_L_PER_PERSON_DAY = 5.5;

export function quantifySafeWater(input: WaterInputs): WaterResult {
  const trace: string[] = [
    "VMR0015 v1.0 equation from the uploaded policy math block. Illustrative, not a Verra issuance.",
  ];
  const pop = Math.max(0, input.population);
  const method = input.qpwMethod ?? "population";
  const perPerson = Math.max(0, input.litresPerPersonDay);
  const cappedRate = Math.min(perPerson, CAP_L_PER_PERSON_DAY);
  const direct = Math.max(0, input.directLitres ?? 0);
  const byCapacity = Math.max(0, input.deviceCapacityLph ?? 0) * Math.max(0, input.deviceUsageHoursYear ?? 0);
  const byPopulation = pop * cappedRate * 365;
  const selected = method === "direct" ? direct : method === "capacity" ? byCapacity : byPopulation;
  const cap = pop * CAP_L_PER_PERSON_DAY * 365;
  const rateCut = perPerson > CAP_L_PER_PERSON_DAY;
  const volumeCut = selected > cap + 1e-9;
  const qpw = Math.min(selected, cap);
  const capBinding = rateCut || volumeCut;
  if (capBinding) trace.push("Paragraph 18 cap is binding: QPW was cut to 5.5 L/person/day.");

  const fnrb =
    input.fnrbPathway === "TOOL30"
      ? ((input.tool30Nrb ?? 0) + (input.tool30Rb ?? 0) > 0
          ? ((input.tool30Nrb ?? 0) / ((input.tool30Nrb ?? 0) + (input.tool30Rb ?? 0))) * TOOL30_DISCOUNT
          : 0)
      : clamp01(input.fnrbDefault ?? 0);
  if (input.fnrbPathway === "TOOL30") trace.push("TOOL30 fNRB includes the policy's 26% uncertainty discount (× 0.74).");

  const tested = input.appliancesTested;
  const gate: 0 | 1 = tested > 0 && input.appliancesPassed / tested >= 0.9 ? 1 : 0;
  const compliance = tested > 0 ? input.appliancesPassed / tested : 0;
  const m = tested > 0 ? (input.appliancesPassed * gate) / tested : 0;
  if (gate === 0) trace.push("Water-quality gate is closed: fewer than 90% of tested appliances passed, or none were tested.");

  const sec = input.stoveEfficiency > 0 ? KJ_TO_BOIL / input.stoveEfficiency : 0;
  const fuel =
    Math.max(0, input.baselineFuelShare) *
      (Math.max(0, input.efCo2TonnesPerTj) * fnrb + Math.max(0, input.efNonCo2TonnesPerTj)) *
      Math.max(0, input.adjLe) +
    Math.max(0, input.extraFuelTerm ?? 0);
  let baseline = (qpw * m * clamp01(input.xBoil) * sec * fuel) / 1e9;
  const network = input.publicNetworkInstalled ? 1 - clamp01(input.publicNetworkShare ?? 0) : 1;
  baseline *= network;
  if (network < 1) trace.push("Public-network households are removed from the baseline (AMS-III.AV table 13).");

  const days = Math.max(0, input.monitoringDays);
  const fossil = Math.max(0, input.residualFuelKgPerDay ?? 0) * days * Math.max(0, input.residualFuelCoef ?? 0);
  const power =
    (Math.max(0, input.gridKwhPerDay ?? 0) * days * Math.max(0, input.gridEfTonnesPerMwh ?? 0) * (1 + Math.max(0, input.tdl ?? 0))) /
    1000;
  const project = fossil + power;
  const leakage = 0;
  let reduction = Math.max((baseline - project - leakage) * gate, 0);
  if (input.reddCleared === false) {
    reduction = 0;
    trace.push("REDD+ clearance is not recorded, so the policy counts no reductions.");
  }
  const credits = Math.floor(reduction + 1e-9);

  trace.push(
    `BE ${baseline.toFixed(3)} t − PE ${project.toFixed(3)} t − LE 0 = ER ${reduction.toFixed(3)} t, issued ${credits} t.`,
  );

  return {
    methodology: "VMR0015 v1.0",
    projectId: input.projectId,
    qpwLitres: Math.round(qpw),
    capLitres: Math.round(cap),
    capBinding,
    fnrb,
    secKjPerLitre: sec,
    waterQualityGate: gate,
    compliance,
    baselineT: baseline,
    projectT: project,
    leakageT: leakage,
    reductionT: reduction,
    creditsTonnes: credits,
    trace,
  };
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 2,000 people, 5 L/person/day, TOOL30 fNRB 0.80 discounted to 0.592, 92 of 100 appliances pass. */
export const DEMO_WATER: WaterInputs = {
  projectId: "WATER-DEMO-01",
  population: 2_000,
  litresPerPersonDay: 5,
  qpwMethod: "population",
  xBoil: 1,
  stoveEfficiency: 0.1,
  baselineFuelShare: 1,
  efCo2TonnesPerTj: 112,
  efNonCo2TonnesPerTj: 8.692,
  adjLe: 0.95,
  fnrbPathway: "TOOL30",
  tool30Nrb: 80,
  tool30Rb: 20,
  appliancesPassed: 92,
  appliancesTested: 100,
  monitoringDays: 365,
  reddCleared: true,
};
