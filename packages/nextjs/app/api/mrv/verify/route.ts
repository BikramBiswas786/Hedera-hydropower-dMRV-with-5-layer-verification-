import { NextResponse } from "next/server";
import { verifyReadings } from "~~/services/mrv/engine";
import { buildHcsMessage } from "~~/services/mrv/report";
import { DEMO_PLANT } from "~~/services/mrv/scenarios";
import { verifyRequestSchema } from "~~/services/mrv/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

/** Runs the 5-layer verification without writing anything. No credentials needed. */
export async function POST(request: Request) {
  try {
    const { readings, plant, gridEmissionFactor } = await parseJsonBody(request, verifyRequestSchema);
    const report = verifyReadings(readings, plant ?? DEMO_PLANT, gridEmissionFactor);
    const { message, reportHash } = buildHcsMessage(report, readings);
    return NextResponse.json({ report, hcsMessage: message, reportHash });
  } catch (error) {
    return toErrorResponse(error);
  }
}
