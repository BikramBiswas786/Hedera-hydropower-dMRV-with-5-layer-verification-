import { NextResponse } from "next/server";
import { toErrorResponse } from "~~/services/mrv/server/http";
import { getPlantDetail } from "~~/services/mrv/server/insights";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ plantId: string }> }) {
  try {
    return NextResponse.json(await getPlantDetail(decodeURIComponent((await params).plantId)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
