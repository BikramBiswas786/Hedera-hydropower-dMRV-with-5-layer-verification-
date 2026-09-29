import { NextResponse } from "next/server";
import { toErrorResponse } from "~~/services/mrv/server/http";
import { getIssuances } from "~~/services/mrv/server/registry";

export const dynamic = "force-dynamic";

/** Every VVB verification: the records it covered, its decision and what it issued. */
export async function GET() {
  try {
    return NextResponse.json({ issuances: await getIssuances() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
