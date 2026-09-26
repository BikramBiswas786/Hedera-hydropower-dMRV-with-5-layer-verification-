/**
 * The two attestations on the legacy Hedera testnet registry `HydroCreditRegistry` at
 * 0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5 (commit 5b7fe3f), read with eth_call (`getPlant`, `getAttestation`)
 * on 26 Sep 2026. HCS audit topic 0.0.10726081. The greenfield parity test replays them through
 * `HydroVmr0017Module` and `DmrvRegistry` and must reproduce 4,791,542 g and 73,386,435 g exactly.
 *
 * The legacy contract had no registration-request date; the replay uses each plant's crediting start, which is
 * before 1 Jan 2027, so the 7-year VMR0017 period stays valid. The legacy "leakageG" is the total LE_y
 * (monitored leakage 0 plus embodied emissions), so the monitored-leakage input is 0.
 */
export type LiveAttestation = {
  id: number;
  plantId: string;
  name: string;
  legacyMeter: string;
  design: {
    projectType: number;
    methodology: number;
    capacityKw: number;
    baselineCapacityKw: number;
    reservoirAreaM2: number;
    baselineReservoirAreaM2: number;
    efGridGPerMwh: number;
    fuelCoefGPerTonne: number;
    creditingStart: bigint;
    creditingEnd: bigint;
    designHash: string;
  };
  periodStart: bigint;
  periodEnd: bigint;
  netEnergyWh: bigint;
  grossEnergyWh: bigint;
  fuelG: bigint;
  expected: {
    baselineG: bigint;
    reservoirG: bigint;
    fossilFuelG: bigint;
    leakageG: bigint;
    reductionG: bigint;
    unitsMinted: bigint;
    balanceG: bigint;
  };
  reportHash: string;
  hcsTopicNum: bigint;
  hcsSequence: bigint;
};

export const LEGACY_REGISTRY = "0x9cdB5782a10c41a103B722d1B8fa9CfaF84107a5";

export const LIVE_ATTESTATIONS: LiveAttestation[] = [
  {
    id: 0,
    plantId: "HYDRO-DEMO-01",
    name: "Demo run-of-river plant",
    legacyMeter: "0x34bD8f8fb9a722adD4688fdcB35bd8DA4FB97De9",
    design: {
      projectType: 0,
      methodology: 1,
      capacityKw: 500,
      baselineCapacityKw: 0,
      reservoirAreaM2: 0,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 573_378,
      fuelCoefGPerTonne: 3_238_840,
      creditingStart: 1_767_225_600n,
      creditingEnd: 1_987_977_600n,
      designHash: "0x4e49cf6d78fcc1e42a1a0e0839a5210801e41613c0e2620672893e91983f26cf",
    },
    periodStart: 1_790_319_600n,
    periodEnd: 1_790_406_000n,
    netEnergyWh: 8_674_392n,
    grossEnergyWh: 8_806_489n,
    fuelG: 0n,
    expected: {
      baselineG: 4_973_705n,
      reservoirG: 0n,
      fossilFuelG: 0n,
      leakageG: 182_163n,
      reductionG: 4_791_542n,
      unitsMinted: 4_791n,
      balanceG: 542n,
    },
    reportHash: "0x8c7ca52161cc064d9947e9adac77743052c366989bd3d7ca43f50ba1efb541c2",
    hcsTopicNum: 10_726_081n,
    hcsSequence: 5n,
  },
  {
    id: 1,
    plantId: "HYDRO-DEMO-02",
    name: "Demo storage plant, renewed crediting period",
    legacyMeter: "0xcd479173da7f6708391A1d6011b475c1525b63C8",
    design: {
      projectType: 0,
      methodology: 1,
      capacityKw: 12_000,
      baselineCapacityKw: 0,
      reservoirAreaM2: 1_800_000,
      baselineReservoirAreaM2: 0,
      efGridGPerMwh: 524_404,
      fuelCoefGPerTonne: 3_238_840,
      creditingStart: 1_772_323_200n,
      creditingEnd: 1_993_075_200n,
      designHash: "0xfeeb57c92e8f179888fef2f1e8ee8d34e6af56b9ccdc5ad59b1558a8d399ea22",
    },
    periodStart: 1_790_319_600n,
    periodEnd: 1_790_406_000n,
    netEnergyWh: 183_203_450n,
    grossEnergyWh: 185_993_351n,
    fuelG: 73_970n,
    expected: {
      baselineG: 96_072_621n,
      reservoirG: 18_599_336n,
      fossilFuelG: 239_577n,
      leakageG: 3_847_273n,
      reductionG: 73_386_435n,
      unitsMinted: 73_386n,
      balanceG: 435n,
    },
    reportHash: "0xfaa646e404762fbd89fb41852453d348c2dc3931bb87f03beb0522f5dfe0eab7",
    hcsTopicNum: 10_726_081n,
    hcsSequence: 10n,
  },
];
