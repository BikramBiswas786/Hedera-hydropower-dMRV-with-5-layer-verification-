import { NextResponse } from "next/server";
import { prepareDexRetire, prepareDexRetireSchema } from "~~/services/mrv/server/creditPool";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

export const dynamic = "force-dynamic";

/** Unsigned steps: swap HBAR for credits on SaucerSwap, deposit, retire. The server never holds the buyer's key. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(await prepareDexRetire(await parseJsonBody(request, prepareDexRetireSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
