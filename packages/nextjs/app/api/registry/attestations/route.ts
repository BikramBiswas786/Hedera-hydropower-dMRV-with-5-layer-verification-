import { NextResponse } from "next/server";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";
import { getAttestations } from "~~/services/mrv/server/registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const start = intParam(params.get("start"), 0, Number.MAX_SAFE_INTEGER);
    const count = intParam(params.get("count"), 20, 100);
    return NextResponse.json({ start, attestations: await getAttestations(start, count) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
