import { NextResponse } from "next/server";
import { DEMO_PLANT, SCENARIOS, type ScenarioName, generateScenario } from "~~/services/mrv/scenarios";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!(name in SCENARIOS)) {
    return NextResponse.json(
      { error: `Unknown scenario. Use one of: ${Object.keys(SCENARIOS).join(", ")}` },
      { status: 404 },
    );
  }
  try {
    const hours = intParam(new URL(request.url).searchParams.get("hours"), 24, 168);
    return NextResponse.json({ plant: DEMO_PLANT, readings: generateScenario(name as ScenarioName, { hours }) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
