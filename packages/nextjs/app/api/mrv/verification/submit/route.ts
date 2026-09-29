import { NextResponse } from "next/server";
import { submitVerificationSchema } from "~~/services/mrv/schema";
import { isAuthorized, writesEnabled } from "~~/services/mrv/server/config";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { submitVerification } from "~~/services/mrv/server/verification";

export const maxDuration = 60;

/**
 * Verification step 2: relay the VVB's signed VerificationStatement to `verifyPeriod`. An approval issues credits
 * into the operator's custody. The server pays the gas, so it requires `Authorization: Bearer $MRV_API_KEY`; anyone
 * can also send the same call from their own wallet.
 */
export async function POST(request: Request) {
  if (!writesEnabled()) {
    return NextResponse.json({ error: "Relaying is disabled: set MRV_API_KEY on the server" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Missing or invalid bearer token" }, { status: 401 });
  }
  try {
    return NextResponse.json(await submitVerification(await parseJsonBody(request, submitVerificationSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
