import { NextResponse } from "next/server";
import { recordRequestSchema } from "~~/services/mrv/schema";
import { isAuthorized, writesEnabled } from "~~/services/mrv/server/config";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { recordReadings } from "~~/services/mrv/server/monitoring";

export const maxDuration = 60;

/**
 * Monitoring: verify → publish readings and report to HCS → `recordMonitoring`. Issues nothing; a VVB's
 * verification does. Requires `Authorization: Bearer $MRV_API_KEY`, and the server key must be the plant's
 * operator or its reporter.
 */
export async function POST(request: Request) {
  if (!writesEnabled()) {
    return NextResponse.json({ error: "Recording is disabled: set MRV_API_KEY on the server" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Missing or invalid bearer token" }, { status: 401 });
  }
  try {
    return NextResponse.json(await recordReadings(await parseJsonBody(request, recordRequestSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
