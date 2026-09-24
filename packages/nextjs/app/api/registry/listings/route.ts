import { NextResponse } from "next/server";
import { toErrorResponse } from "~~/services/mrv/server/http";
import { getOpenListings } from "~~/services/mrv/server/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ listings: await getOpenListings() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
