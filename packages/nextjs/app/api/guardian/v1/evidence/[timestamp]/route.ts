import { NextResponse } from "next/server";
import { verifyEvidence } from "~~/services/mrv/server/guardianBridge";
import { toErrorResponse } from "~~/services/mrv/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verifies Guardian evidence from the mirror node and IPFS: a VP consensus timestamp, a mint transaction id
 * (`0.0.x@secs.nanos`, read from its memo) or `nft:<tokenId>:<serial>`. `?topicIds=0.0.a,0.0.b` names the policy
 * topics the evidence must come from. Refuses chains that contain a MintToken VC. Read-only, no credentials.
 */
export async function GET(request: Request, { params }: { params: Promise<{ timestamp: string }> }) {
  try {
    const { timestamp } = await params;
    const topics = new URL(request.url).searchParams.get("topicIds");
    const result = await verifyEvidence(decodeURIComponent(timestamp), topics ? topics.split(",") : null);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
