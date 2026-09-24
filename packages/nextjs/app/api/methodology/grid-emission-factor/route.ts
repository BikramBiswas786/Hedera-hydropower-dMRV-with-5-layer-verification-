import { NextResponse } from "next/server";
import { gridEmissionFactorRequestSchema } from "~~/services/mrv/methodology/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { gridEmissionFactor } from "~~/services/mrv/server/methodology";

/** TOOL07 ex-ante combined margin (OM, BM sample group, weights) from per-unit grid data. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(gridEmissionFactor(await parseJsonBody(request, gridEmissionFactorRequestSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
