import { NextResponse } from "next/server";
import { readCreditPool } from "~~/services/mrv/server/creditPool";
import { toErrorResponse } from "~~/services/mrv/server/http";

export const dynamic = "force-dynamic";

/** SaucerSwap V1 WHBAR/credit pool for this registry, if one exists. Reading needs no key. */
export async function GET() {
  try {
    return NextResponse.json(await readCreditPool());
  } catch (error) {
    return toErrorResponse(error);
  }
}
