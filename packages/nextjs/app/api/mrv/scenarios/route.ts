import { NextResponse } from "next/server";
import { DEMO_METERING, DEMO_PLANTS } from "~~/services/mrv/demo";
import { SCENARIOS } from "~~/services/mrv/scenarios";

export function GET() {
  const scenarios = Object.entries(SCENARIOS).map(([name, description]) => ({ name, description }));
  return NextResponse.json({ plants: DEMO_PLANTS, metering: DEMO_METERING, scenarios });
}
