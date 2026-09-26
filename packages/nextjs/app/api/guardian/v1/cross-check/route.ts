import { NextResponse } from "next/server";
import { handleCrossCheck } from "~~/services/mrv/server/guardianBridge";
import { toErrorResponse } from "~~/services/mrv/server/http";

// jsonld canonicalisation and Ed25519 signing need Node, not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Called by a Guardian httpRequestBlock with the policy's Monitoring Report VC as the body. Answers with a
 * "DMRV Cross-Check Result" VC signed by the bridge DID (Ed25519Signature2018). Requires
 * `Authorization: Bearer $GUARDIAN_BRIDGE_API_KEY`; 503 until the bridge key, DID and result schema are set.
 */
export async function POST(request: Request) {
  try {
    return NextResponse.json(await handleCrossCheck(request));
  } catch (error) {
    return toErrorResponse(error);
  }
}
