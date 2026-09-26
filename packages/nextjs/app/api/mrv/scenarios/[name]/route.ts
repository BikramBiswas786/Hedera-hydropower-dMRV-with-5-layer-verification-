import { NextResponse } from "next/server";
import { DEMO_PLANTS, findDemoPlant } from "~~/services/mrv/demo";
import { PREVIEW_METER_DOMAIN, SCENARIOS, type ScenarioName, generateScenario } from "~~/services/mrv/scenarios";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";

/** A ready-to-post `/api/mrv/verify` body. The signature is for a preview domain, not the live registry. */
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
    const signLive = process.env.SCENARIO_SIGN_LIVE_REGISTRY === "true";
    const scenario = generateScenario(name as ScenarioName, {
      hours,
      plant,
      ...(signLive ? {} : { domain: PREVIEW_METER_DOMAIN }),
    });
    return NextResponse.json({
      ...scenario,
      demoMeterKeyPublic: true,
      acceptedByLiveRegistry: signLive,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
