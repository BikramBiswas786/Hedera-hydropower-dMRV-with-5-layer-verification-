import { DEMO_PLANT, demoMeterKey, demoMeteringFor } from "./demo";
import { defaultMeterDomain } from "./network";
import { type MeterDomain, signMeterStatement } from "./provenance";
import type { Metering, PlantProfile, Reading } from "./schema";

/** Public samples are signed (EIP-712, sequence 0) for this domain. No registry will accept them. */
export const PREVIEW_METER_DOMAIN: MeterDomain = {
  chainId: 1,
  registry: "0x0000000000000000000000000000000000000000",
  sequence: 0,
};

export const SCENARIOS = {
  healthy: "24 h of normal operation with main and check meters in agreement. Should be APPROVED.",
  "diesel-backup":
    "A 3-hour grid outage: the plant stops exporting and a diesel generator runs the auxiliaries, adding PE_FF via TOOL03. Should be APPROVED.",
  "calibration-overdue":
    "The main meter's calibration expired: export is reduced and import increased by its maximum permissible error. Should be APPROVED with the deduction.",
  "meter-drift":
    "The main meter reads 1.5% above the check meter in the afternoon; the lower reading is used. Should be FLAGGED.",
  "data-gaps": "Four hours of missing data, credited as zero. Should be FLAGGED (under 90% coverage).",
  spikes:
    "Three intervals report more energy than the water can produce; they are credited as zero. Should be FLAGGED.",
  polluted: "Water-quality sensors report acidic, very turbid water. Quantity unchanged, FLAGGED for review.",
  inflated: "Meter tampering: every interval reports 35% more energy than the water can produce. Should be REJECTED.",
  replay: "Four intervals re-submitted with the same timestamps to double count energy. Should be REJECTED.",
  tampered:
    "Main and check meter export raised 1% in six intervals after the meter signed the batch: the meters agree and the physics is plausible, only the signature catches it. Should be REJECTED.",
} as const;

export type ScenarioName = keyof typeof SCENARIOS;
export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[];

/** Small deterministic PRNG (mulberry32) so every scenario is reproducible. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** The most recent whole hour, so generated periods never end in the future. */
export function lastWholeHour(now = Date.now()): Date {
  return new Date(Math.floor(now / 3_600_000) * 3_600_000);
}

/** Typical operating point of each demo plant: turbine flow, net head and the plant's true efficiency. */
const OPERATING_POINT: Record<string, { flow: number; head: number; efficiency: number }> = {
  "HYDRO-DEMO-01": { flow: 1.1, head: 40, efficiency: 0.85 },
  "HYDRO-DEMO-02": { flow: 12, head: 85, efficiency: 0.88 },
};
/** Station service: the share of gross generation consumed on site before the grid meter. */
const AUXILIARY_SHARE = 0.015;

export type GenerateOptions = {
  end?: Date;
  hours?: number;
  seed?: number;
  plant?: PlantProfile;
  /** Registry the meter statement is signed for; defaults to this app's registry. */
  domain?: MeterDomain;
};
export type ScenarioRequest = {
  plant: PlantProfile;
  metering: Metering;
  readings: Reading[];
  signature: string;
  domain: MeterDomain;
};

/**
 * Generates hourly monitoring data for a demo plant. Flow follows a gentle diurnal curve with ±1% sensor noise;
 * gross generation is ρ·g·Q·H·η at the plant's true efficiency; the main meter exports it net of station service
 * and the check meter agrees within ±0.1%. The plant's demo meter signs the batch's statement as delivered, so manipulations
 * that happen at the meter are signed and must be caught by QA/QC and physics, while `tampered` edits after signing.
 */
export function generateScenario(scenario: ScenarioName, options: GenerateOptions = {}): ScenarioRequest {
  const plant = options.plant ?? DEMO_PLANT;
  const point = OPERATING_POINT[plant.plantId] ?? OPERATING_POINT[DEMO_PLANT.plantId];
  const hours = options.hours ?? 24;
  const end = (options.end ?? lastWholeHour()).getTime();
  const random = prng(options.seed ?? 7);
  const noise = (pct: number) => 1 + (random() * 2 - 1) * pct;

  let readings: Reading[] = Array.from({ length: hours }, (_, i) => {
    const timestamp = new Date(end - (hours - 1 - i) * 3_600_000);
    const diurnal = 1 + 0.05 * Math.sin((2 * Math.PI * timestamp.getUTCHours()) / 24);
    const flowRateM3s = round(point.flow * diurnal * noise(0.01), 4);
    const headM = round(point.head * noise(0.005), 3);
    const generationKwh = round(9.81 * flowRateM3s * headM * point.efficiency * noise(0.01), 3);
    const exportKwh = round(generationKwh * (1 - AUXILIARY_SHARE), 3);
    return {
      timestamp: timestamp.toISOString(),
      intervalMinutes: 60,
      generationKwh,
      exportKwh,
      importKwh: 0,
      checkExportKwh: round(exportKwh * noise(0.001), 3),
      flowRateM3s,
      headM,
      fuelKg: 0,
      ph: round(7.2 * noise(0.02), 2),
      turbidityNtu: round(12 * noise(0.2), 1),
      temperatureC: round(14 * noise(0.05), 1),
    };
  });
  let metering = demoMeteringFor(plant.plantId);

  switch (scenario) {
    case "healthy":
      break;
    case "diesel-backup":
      // Grid outage: no export, the plant trips, auxiliaries run on a diesel generator (~25 kg/h).
      readings = readings.map((r, i) =>
        i >= 8 && i < 11
          ? {
              ...r,
              generationKwh: 0,
              exportKwh: 0,
              checkExportKwh: 0,
              flowRateM3s: 0,
              fuelKg: round(25 * noise(0.05), 2),
            }
          : r,
      );
      break;
    case "calibration-overdue":
      metering = { ...metering, calibrationValidUntil: new Date(end - 30 * 86_400_000).toISOString() };
      break;
    case "meter-drift":
      readings = readings.map((r, i) =>
        i >= 12 && i < 18 ? { ...r, exportKwh: round((r.checkExportKwh ?? r.exportKwh) * 1.015, 3) } : r,
      );
      break;
    case "data-gaps":
      readings = readings.filter((_, i) => i < 6 || i >= 10);
      break;
    case "spikes":
      readings = readings.map((r, i) =>
        [5, 12, 19].includes(i)
          ? {
              ...r,
              generationKwh: round(r.generationKwh * 1.22, 3),
              exportKwh: round(r.exportKwh * 1.22, 3),
              checkExportKwh: round((r.checkExportKwh ?? r.exportKwh) * 1.22, 3),
            }
          : r,
      );
      break;
    case "polluted":
      readings = readings.map(r => ({ ...r, ph: 5.3, turbidityNtu: 240 }));
      break;
    case "inflated":
      readings = readings.map(r => ({
        ...r,
        generationKwh: round(r.generationKwh * 1.35, 3),
        exportKwh: round(r.exportKwh * 1.35, 3),
        checkExportKwh: round((r.checkExportKwh ?? r.exportKwh) * 1.35, 3),
      }));
      break;
    case "replay":
      readings = [...readings.slice(0, 14), ...readings.slice(10, 14), ...readings.slice(14)];
      break;
    case "tampered":
      break;
  }
  const domain = options.domain ?? defaultMeterDomain();
  const signature = signMeterStatement(demoMeterKey(plant.plantId), domain, plant.plantId, readings);
  if (scenario === "tampered") {
    readings = readings.map((r, i) =>
      i >= 12 && i < 18
        ? { ...r, exportKwh: round(r.exportKwh * 1.01, 3), checkExportKwh: round((r.checkExportKwh ?? 0) * 1.01, 3) }
        : r,
    );
  }
  return { plant, metering, readings, signature, domain };
}
