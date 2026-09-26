import { NextResponse } from "next/server";
import { waterRequestSchema } from "~~/services/mrv/documents/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { quantifySafeWater } from "~~/services/mrv/water/vmr0015";

/** Illustrative VMR0015 quantification. Does not mint hydro credits. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(quantifySafeWater(await parseJsonBody(request, waterRequestSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
