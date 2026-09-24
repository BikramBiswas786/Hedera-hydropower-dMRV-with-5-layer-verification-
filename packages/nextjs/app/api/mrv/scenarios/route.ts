import { NextResponse } from "next/server";
import { DEMO_PLANTS, demoMeteringFor } from "~~/services/mrv/demo";
import { SCENARIOS } from "~~/services/mrv/scenarios";

export function GET() {
  const scenarios = Object.entries(SCENARIOS).map(([name, description]) => ({ name, description }));
  const metering = Object.fromEntries(DEMO_PLANTS.map(plant => [plant.plantId, demoMeteringFor(plant.plantId)]));
  return NextResponse.json({ plants: DEMO_PLANTS, metering, scenarios });
}
