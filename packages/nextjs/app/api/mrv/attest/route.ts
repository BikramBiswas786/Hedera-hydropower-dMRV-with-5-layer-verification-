import { NextResponse } from "next/server";
import { verifyRequestSchema } from "~~/services/mrv/schema";
import { attestReadings } from "~~/services/mrv/server/attest";
import { isAuthorized, writesEnabled } from "~~/services/mrv/server/config";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

export const maxDuration = 60;

/** Verify → publish to HCS → submitAttestation. Requires `Authorization: Bearer $MRV_API_KEY`. */
export async function POST(request: Request) {
  if (!writesEnabled()) {
    return NextResponse.json({ error: "Attestation is disabled: set MRV_API_KEY on the server" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Missing or invalid bearer token" }, { status: 401 });
  }
  try {
    return NextResponse.json(await attestReadings(await parseJsonBody(request, verifyRequestSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
