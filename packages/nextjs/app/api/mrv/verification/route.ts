import { NextResponse } from "next/server";
import { prepareVerificationSchema } from "~~/services/mrv/schema";
import { isAuthorized, writesEnabled } from "~~/services/mrv/server/config";
import { BadRequestError, parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { getPendingVerification, prepareVerification } from "~~/services/mrv/server/verification";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * `?plantId=HYDRO-DEMO-01[&lastRecord=n]`: the run of monitoring records a VVB verifies next, each reproduced from
 * HCS (engine, registered design, meter, hash chain). Read-only; `{ pending: null }` when nothing awaits.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const plantId = params.get("plantId");
    if (!plantId) throw new BadRequestError("Pass ?plantId=");
    const last = params.get("lastRecord");
    return NextResponse.json({
      pending: await getPendingVerification(plantId, last === null ? undefined : Number(last)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Verification step 1: publish the verification report on HCS and return the VerificationStatement the VVB signs
 * with its own key (step 2 is `/api/mrv/verification/submit`). Publishing writes through the server, so it requires
 * `Authorization: Bearer $MRV_API_KEY`. The server never holds a VVB key.
 */
export async function POST(request: Request) {
  if (!writesEnabled()) {
    return NextResponse.json({ error: "Verification is disabled: set MRV_API_KEY on the server" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Missing or invalid bearer token" }, { status: 401 });
  }
  try {
    return NextResponse.json(await prepareVerification(await parseJsonBody(request, prepareVerificationSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
