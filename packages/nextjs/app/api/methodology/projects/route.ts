import { NextResponse } from "next/server";
import { toErrorResponse } from "~~/services/mrv/server/http";
import { getProjects } from "~~/services/mrv/server/methodology";

export const dynamic = "force-dynamic";

/** Design documents of the demo plants with their assessment and on-chain designHash check. */
export async function GET() {
  try {
    return NextResponse.json(await getProjects());
  } catch (error) {
    return toErrorResponse(error);
  }
}
