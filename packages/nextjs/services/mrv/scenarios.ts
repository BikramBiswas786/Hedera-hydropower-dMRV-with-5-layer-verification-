import type { PlantProfile, Reading } from "./schema";

/** Matches the plant registered on-chain by `packages/hardhat/deploy/01_setup_hydro_rec.ts`. */
export const DEMO_PLANT: PlantProfile = {
  plantId: "HYDRO-DEMO-01",
  capacityKw: 500,
  maxFlowM3s: 2,
  maxHeadM: 60,
  efficiency: 0.85,
  minEfficiency: 0.7,
  maxEfficiency: 0.95,
};

export const SCENARIOS = {
  healthy: "24 h of normal run-of-river operation. Should be APPROVED.",
  inflated: "Meter tampering: every interval reports 35% more energy than the water can produce. Should be REJECTED.",
  replay: "Four intervals re-submitted with the same timestamps to double count energy. Should be REJECTED.",
  spikes: "Three isolated energy spikes, e.g. a faulty meter. Should be FLAGGED for review.",
  polluted: "Water-quality sensors report acidic, very turbid water. Should be FLAGGED for review.",
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

export type GenerateOptions = { end?: Date; hours?: number; seed?: number };

/**
 * Generates hourly readings for the demo plant. Flow follows a gentle diurnal curve with ±1% sensor noise and
 * metered energy tracks ρ·g·Q·H·η within ±2%, which is what a healthy run-of-river plant looks like.
 */
export function generateScenario(scenario: ScenarioName, options: GenerateOptions = {}): Reading[] {
  const hours = options.hours ?? 24;
  const end = (options.end ?? lastWholeHour()).getTime();
  const random = prng(options.seed ?? 7);
  const noise = (pct: number) => 1 + (random() * 2 - 1) * pct;

  const readings: Reading[] = Array.from({ length: hours }, (_, i) => {
    const timestamp = new Date(end - (hours - 1 - i) * 3_600_000);
    const diurnal = 1 + 0.05 * Math.sin((2 * Math.PI * timestamp.getUTCHours()) / 24);
    const flowRateM3s = round(1.1 * diurnal * noise(0.01), 4);
    const headM = round(40 * noise(0.005), 3);
    const hydraulicKwh = (1_000 * 9.81 * flowRateM3s * headM * DEMO_PLANT.efficiency) / 1_000;
    return {
      timestamp: timestamp.toISOString(),
      intervalMinutes: 60,
      flowRateM3s,
      headM,
      energyKwh: round(hydraulicKwh * noise(0.02), 3),
      efficiency: DEMO_PLANT.efficiency,
      ph: round(7.2 * noise(0.02), 2),
      turbidityNtu: round(12 * noise(0.2), 1),
      temperatureC: round(14 * noise(0.05), 1),
    };
  });

  switch (scenario) {
    case "healthy":
      return readings;
    case "inflated":
      return readings.map(r => ({ ...r, energyKwh: round(r.energyKwh * 1.35, 3) }));
    case "replay":
      return [...readings.slice(0, 14), ...readings.slice(10, 14), ...readings.slice(14)];
    case "spikes":
      return readings.map((r, i) => ([5, 12, 19].includes(i) ? { ...r, energyKwh: round(r.energyKwh * 1.22, 3) } : r));
    case "polluted":
      return readings.map(r => ({ ...r, ph: 5.3, turbidityNtu: 240 }));
  }
}
