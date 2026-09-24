import { NextResponse } from "next/server";
import { DEMO_PLANTS, findDemoPlant } from "~~/services/mrv/demo";
import { SCENARIOS, type ScenarioName, generateScenario } from "~~/services/mrv/scenarios";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";

/** A ready-to-post `/api/mrv/verify` body: `{ plant, metering, readings }`. `?plant=` picks a demo plant. */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!(name in SCENARIOS)) {
    return NextResponse.json(
      { error: `Unknown scenario. Use one of: ${Object.keys(SCENARIOS).join(", ")}` },
      { status: 404 },
    );
  }
  const search = new URL(request.url).searchParams;
  const plantId = search.get("plant") ?? DEMO_PLANTS[0].plantId;
  const plant = findDemoPlant(plantId);
  if (!plant) {
    return NextResponse.json(
      { error: `Unknown plant. Use one of: ${DEMO_PLANTS.map(p => p.plantId).join(", ")}` },
      { status: 404 },
    );
  }
  try {
    const hours = intParam(search.get("hours"), 24, 168);
    return NextResponse.json(generateScenario(name as ScenarioName, { hours, plant }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
