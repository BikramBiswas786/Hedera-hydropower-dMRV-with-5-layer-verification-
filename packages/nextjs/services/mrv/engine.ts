import type { PlantProfile, Reading } from "./schema";

export const ENGINE_VERSION = "hydro-dmrv-engine@1.0.0";

const WATER_DENSITY_KG_M3 = 1_000;
const GRAVITY_M_S2 = 9.81;
const TIMESTAMP_TOLERANCE_MS = 60_000;
const MIN_SAMPLE_FOR_STATISTICS = 6;
const MODIFIED_Z_OUTLIER = 3.5;
const MODIFIED_Z_SUSPICIOUS = 2.5;
/** Share of intervals that may fail the physics check before the whole batch is treated as unsupported. */
const MAX_PHYSICS_FAILURE_SHARE = 0.2;

/** Default grid emission factor (tCO2/MWh) for the informational ACM0002 estimate. Override per grid. */
export const DEFAULT_GRID_EMISSION_FACTOR = 0.82;

export const LAYER_WEIGHTS = {
  physics: 0.3,
  temporal: 0.25,
  environmental: 0.2,
  statistical: 0.15,
  device: 0.1,
} as const;

export const DECISION_THRESHOLDS = { approve: 0.9, review: 0.5 } as const;

export type LayerName = keyof typeof LAYER_WEIGHTS;
export type LayerStatus = "PASS" | "WARN" | "FAIL";
export type Decision = "APPROVED" | "FLAGGED" | "REJECTED";

export type Issue = {
  layer: LayerName;
  /** Index into the submitted readings, or `null` for batch-level issues. */
  reading: number | null;
  severity: "warn" | "fail";
  message: string;
};

export type LayerResult = {
  layer: LayerName;
  score: number;
  weight: number;
  status: LayerStatus;
  summary: string;
};

export type VerificationReport = {
  engine: string;
  plantId: string;
  periodStart: number;
  periodEnd: number;
  readingCount: number;
  energyWh: number;
  trustScore: number;
  trustScoreBps: number;
  decision: Decision;
  reasoning: string;
  layers: LayerResult[];
  issues: Issue[];
  /** Integrity failures that force REJECTED regardless of the weighted score. */
  hardFailures: string[];
  carbon: { gridEmissionFactor: number; emissionReductionTco2: number };
};

type LayerOutcome = { scores: number[]; issues: Issue[]; summary: string };

const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1);
const hoursOf = (r: Reading) => r.intervalMinutes / 60;
const efficiencyOf = (r: Reading, plant: PlantProfile) => r.efficiency ?? plant.efficiency;

/** Hydraulic energy available in the interval: E = ρ·g·Q·H·η·t (kWh). */
export function expectedEnergyKwh(reading: Reading, plant: PlantProfile): number {
  const powerKw =
    (WATER_DENSITY_KG_M3 * GRAVITY_M_S2 * reading.flowRateM3s * reading.headM * efficiencyOf(reading, plant)) / 1_000;
  return powerKw * hoursOf(reading);
}

function statusOf(score: number): LayerStatus {
  if (score < 0.5) return "FAIL";
  if (score < 0.85) return "WARN";
  return "PASS";
}

/** Layer 1 — metered energy must match what the measured flow and head can physically produce. */
function physicsLayer(readings: Reading[], plant: PlantProfile, hardFailures: string[]): LayerOutcome {
  const issues: Issue[] = [];
  const scores = readings.map((r, i) => {
    const expected = expectedEnergyKwh(r, plant);
    if (expected === 0) {
      if (r.energyKwh === 0) return 1;
      issues.push({
        layer: "physics",
        reading: i,
        severity: "fail",
        message: "Energy reported with zero flow or head",
      });
      return 0;
    }
    const deviation = Math.abs(r.energyKwh - expected) / expected;
    const score =
      deviation < 0.05
        ? 1
        : deviation < 0.1
          ? 0.95
          : deviation < 0.15
            ? 0.85
            : deviation < 0.2
              ? 0.7
              : deviation < 0.3
                ? 0.5
                : 0;
    if (score < 0.85) {
      issues.push({
        layer: "physics",
        reading: i,
        severity: score === 0 ? "fail" : "warn",
        message: `Metered ${round(r.energyKwh, 1)} kWh vs ${round(expected, 1)} kWh hydraulic (${round(deviation * 100, 1)}% deviation)`,
      });
    }
    return score;
  });
  const failing = scores.filter(s => s === 0).length;
  if (failing / readings.length > MAX_PHYSICS_FAILURE_SHARE) {
    hardFailures.push(`${failing}/${readings.length} intervals report more energy than the water can produce`);
  }
  return {
    scores,
    issues,
    summary: `${readings.length - failing}/${readings.length} intervals within 30% of ρ·g·Q·H·η`,
  };
}

function changeScore(change: number, bands: [number, number][], floor: number): number {
  for (const [limit, score] of bands) if (change < limit) return score;
  return floor;
}

/** Layer 2 — timestamps must be contiguous (no replays or gaps) and values must not jump implausibly. */
function temporalLayer(readings: Reading[], hardFailures: string[]): LayerOutcome {
  const issues: Issue[] = [];
  const scores = readings.map((r, i) => {
    if (i === 0) return 1;
    const prev = readings[i - 1];
    const elapsedMs = Date.parse(r.timestamp) - Date.parse(prev.timestamp);
    if (elapsedMs <= 0) {
      issues.push({
        layer: "temporal",
        reading: i,
        severity: "fail",
        message: "Duplicate or out-of-order timestamp (possible replay)",
      });
      return 0;
    }

    let score = 1;
    if (Math.abs(elapsedMs - r.intervalMinutes * 60_000) > TIMESTAMP_TOLERANCE_MS) {
      issues.push({
        layer: "temporal",
        reading: i,
        severity: "warn",
        message: `Gap of ${round(elapsedMs / 60_000, 1)} min between intervals`,
      });
      score *= 0.8;
    }
    const rel = (a: number, b: number) => Math.abs(a - b) / (b || 1);
    score *= changeScore(
      rel(r.energyKwh, prev.energyKwh),
      [
        [0.1, 1],
        [0.2, 0.95],
        [0.3, 0.85],
        [0.5, 0.7],
      ],
      0.3,
    );
    score *= changeScore(
      rel(r.flowRateM3s, prev.flowRateM3s),
      [
        [0.15, 1],
        [0.3, 0.95],
        [0.5, 0.8],
      ],
      0.5,
    );
    score *= changeScore(
      rel(r.headM, prev.headM),
      [
        [0.05, 1],
        [0.1, 0.95],
        [0.2, 0.8],
      ],
      0.5,
    );
    if (score < 0.85 && score > 0) {
      issues.push({ layer: "temporal", reading: i, severity: "warn", message: "Abrupt change from previous interval" });
    }
    return score;
  });

  if (issues.some(issue => issue.severity === "fail")) {
    hardFailures.push("Duplicate or out-of-order timestamps: the batch could double count energy");
  }
  return { scores, issues, summary: `${issues.length} continuity issue(s) across ${readings.length} intervals` };
}

type Band = { ideal: [number, number]; acceptable: [number, number]; questionable: [number, number] };

const ENVIRONMENTAL_BANDS: Record<"ph" | "turbidityNtu" | "temperatureC", Band> = {
  ph: { ideal: [6.5, 8.5], acceptable: [6, 9], questionable: [5.5, 9.5] },
  turbidityNtu: { ideal: [0, 50], acceptable: [0, 100], questionable: [0, 200] },
  temperatureC: { ideal: [0, 30], acceptable: [-5, 35], questionable: [-10, 40] },
};

const within = (value: number, [min, max]: [number, number]) => value >= min && value <= max;

/** Layer 3 — water quality must be plausible for a river; implausible values point at faulty or fake sensors. */
function environmentalLayer(readings: Reading[]): LayerOutcome {
  const issues: Issue[] = [];
  const scores = readings.map((r, i) => {
    let score = 1;
    for (const key of Object.keys(ENVIRONMENTAL_BANDS) as (keyof typeof ENVIRONMENTAL_BANDS)[]) {
      const value = r[key];
      if (value === undefined) continue;
      const band = ENVIRONMENTAL_BANDS[key];
      if (within(value, band.ideal)) continue;
      const factor = within(value, band.acceptable) ? 0.95 : within(value, band.questionable) ? 0.8 : 0.3;
      score *= factor;
      if (factor < 0.95) {
        issues.push({
          layer: "environmental",
          reading: i,
          severity: factor < 0.5 ? "fail" : "warn",
          message: `${key} = ${value} outside expected range`,
        });
      }
    }
    return score;
  });
  const measured = readings.filter(
    r => r.ph !== undefined || r.turbidityNtu !== undefined || r.temperatureC !== undefined,
  ).length;
  return { scores, issues, summary: `${measured}/${readings.length} intervals carried water-quality data` };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Layer 4 — robust outlier detection on the metered / hydraulic energy ratio of each interval.
 * Uses the modified z-score (Iglewicz & Hoaglin): 0.6745·(x − median) / MAD, which a few bad points cannot skew.
 */
function statisticalLayer(readings: Reading[], plant: PlantProfile): LayerOutcome {
  const ratios = readings.map(r => {
    const expected = expectedEnergyKwh(r, plant);
    return expected > 0 ? r.energyKwh / expected : 0;
  });
  if (readings.length < MIN_SAMPLE_FOR_STATISTICS) {
    return {
      scores: ratios.map(() => 1),
      issues: [],
      summary: `Skipped: needs ≥${MIN_SAMPLE_FOR_STATISTICS} intervals`,
    };
  }

  const med = median(ratios);
  const mad = median(ratios.map(x => Math.abs(x - med)));
  const issues: Issue[] = [];
  const scores = ratios.map((x, i) => {
    const z = mad === 0 ? (x === med ? 0 : Infinity) : (0.6745 * (x - med)) / mad;
    const magnitude = Math.abs(z);
    if (magnitude < MODIFIED_Z_SUSPICIOUS) return 1;
    const outlier = magnitude >= MODIFIED_Z_OUTLIER;
    issues.push({
      layer: "statistical",
      reading: i,
      severity: outlier ? "fail" : "warn",
      message: `Metered/hydraulic ratio ${round(x * 100, 1)}% is an ${outlier ? "outlier" : "unusual value"} (modified z = ${Number.isFinite(z) ? round(z, 2) : "∞"})`,
    });
    return outlier ? 0.2 : 0.7;
  });
  return {
    scores,
    issues,
    summary: `Median metered/hydraulic ratio ${round(med * 100, 1)}%, ${issues.length} outlier(s)`,
  };
}

/** Layer 5 — readings must fit the registered equipment envelope. */
function deviceLayer(readings: Reading[], plant: PlantProfile, hardFailures: string[]): LayerOutcome {
  const issues: Issue[] = [];
  let exceedsCapacity = false;
  const scores = readings.map((r, i) => {
    let score = 1;
    const fail = (message: string, factor: number) => {
      score *= factor;
      issues.push({ layer: "device", reading: i, severity: factor <= 0.5 ? "fail" : "warn", message });
    };
    if (r.energyKwh > plant.capacityKw * hoursOf(r)) {
      exceedsCapacity = true;
      fail(`Energy exceeds ${plant.capacityKw} kW nameplate capacity for the interval`, 0.5);
    }
    if (r.flowRateM3s > plant.maxFlowM3s) fail(`Flow ${r.flowRateM3s} m³/s above design maximum`, 0.5);
    if (r.headM > plant.maxHeadM) fail(`Head ${r.headM} m above design maximum`, 0.5);
    const efficiency = efficiencyOf(r, plant);
    if (efficiency < plant.minEfficiency || efficiency > plant.maxEfficiency) {
      fail(`Declared efficiency ${round(efficiency * 100, 1)}% outside equipment range`, 0.7);
    }
    return score;
  });
  if (exceedsCapacity) hardFailures.push("Metered energy exceeds nameplate capacity");
  return {
    scores,
    issues,
    summary: `${readings.length - new Set(issues.map(x => x.reading)).size}/${readings.length} intervals inside the equipment envelope`,
  };
}

function decide(
  trustScore: number,
  hardFailures: string[],
  issues: Issue[],
): { decision: Decision; reasoning: string } {
  const pct = `${round(trustScore * 100, 1)}%`;
  if (hardFailures.length) return { decision: "REJECTED", reasoning: `Integrity failure: ${hardFailures.join("; ")}` };
  const failedIntervals = new Set(issues.filter(i => i.severity === "fail").map(i => i.reading)).size;
  if (trustScore >= DECISION_THRESHOLDS.approve) {
    // A high average must not launder individual bad intervals into issued certificates.
    return failedIntervals
      ? {
          decision: "FLAGGED",
          reasoning: `High confidence (${pct}) but ${failedIntervals} interval(s) failed a check; requires manual review`,
        }
      : { decision: "APPROVED", reasoning: `High confidence (${pct}); eligible for issuance` };
  }
  if (trustScore >= DECISION_THRESHOLDS.review)
    return { decision: "FLAGGED", reasoning: `Medium confidence (${pct}); requires manual review` };
  return { decision: "REJECTED", reasoning: `Low confidence (${pct}); multiple checks failed` };
}

/**
 * Runs the five verification layers over a batch of interval readings and produces the report that is anchored
 * on HCS. Pure and deterministic: the same input always yields the same report, so anyone can re-run it.
 */
export function verifyReadings(
  readings: Reading[],
  plant: PlantProfile,
  gridEmissionFactor = DEFAULT_GRID_EMISSION_FACTOR,
): VerificationReport {
  if (readings.length === 0) throw new Error("At least one reading is required");

  const hardFailures: string[] = [];
  const outcomes: Record<LayerName, LayerOutcome> = {
    physics: physicsLayer(readings, plant, hardFailures),
    temporal: temporalLayer(readings, hardFailures),
    environmental: environmentalLayer(readings),
    statistical: statisticalLayer(readings, plant),
    device: deviceLayer(readings, plant, hardFailures),
  };

  const layers = (Object.keys(LAYER_WEIGHTS) as LayerName[]).map(layer => {
    const score = round(mean(outcomes[layer].scores));
    return { layer, score, weight: LAYER_WEIGHTS[layer], status: statusOf(score), summary: outcomes[layer].summary };
  });
  const trustScore = round(layers.reduce((sum, l) => sum + l.score * l.weight, 0));
  const issues = Object.values(outcomes).flatMap(o => o.issues);
  const { decision, reasoning } = decide(trustScore, hardFailures, issues);

  const timestamps = readings.map(r => Date.parse(r.timestamp));
  const periodEndMs = Math.max(...timestamps);
  const firstIndex = timestamps.indexOf(Math.min(...timestamps));
  const periodStartMs = timestamps[firstIndex] - readings[firstIndex].intervalMinutes * 60_000;
  const energyWh = Math.round(readings.reduce((sum, r) => sum + r.energyKwh, 0) * 1_000);

  return {
    engine: ENGINE_VERSION,
    plantId: plant.plantId,
    periodStart: Math.floor(periodStartMs / 1_000),
    periodEnd: Math.floor(periodEndMs / 1_000),
    readingCount: readings.length,
    energyWh,
    trustScore,
    trustScoreBps: Math.round(trustScore * 10_000),
    decision,
    reasoning,
    layers,
    issues,
    hardFailures,
    carbon: {
      gridEmissionFactor,
      // ACM0002 for run-of-river: ER = EG × EF_grid (project and leakage emissions ≈ 0).
      emissionReductionTco2: round((energyWh / 1_000_000) * gridEmissionFactor, 6),
    },
  };
}
