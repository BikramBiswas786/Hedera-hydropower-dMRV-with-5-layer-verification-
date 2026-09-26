import { NextResponse } from "next/server";
import { readDexCheck } from "~~/services/mrv/server/dex";
import { toErrorResponse } from "~~/services/mrv/server/http";

export const dynamic = "force-dynamic";

/** SaucerSwap spot versus the settlement oracle. Reading needs no key. */
export async function GET() {
  try {
    return NextResponse.json(await readDexCheck());
  } catch (error) {
    return toErrorResponse(error);
  }
}
