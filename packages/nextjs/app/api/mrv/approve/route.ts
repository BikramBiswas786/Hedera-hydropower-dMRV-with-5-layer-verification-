import { NextResponse } from "next/server";
import { attestRequestSchema } from "~~/services/mrv/schema";
import { prepareApproval } from "~~/services/mrv/server/attest";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

/**
 * For a VVB: the EIP-712 VerifierApproval DmrvRegistry will check for these readings and the step-1 anchor.
 * No credentials needed and nothing is written or signed here.
 */
export async function POST(request: Request) {
  try {
    return NextResponse.json(await prepareApproval(await parseJsonBody(request, attestRequestSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
