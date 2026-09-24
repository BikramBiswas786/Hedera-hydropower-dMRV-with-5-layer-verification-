import { NextResponse } from "next/server";
import { DEMO_PLANT, SCENARIOS } from "~~/services/mrv/scenarios";

export function GET() {
  const scenarios = Object.entries(SCENARIOS).map(([name, description]) => ({ name, description }));
  return NextResponse.json({ plant: DEMO_PLANT, scenarios });
}
