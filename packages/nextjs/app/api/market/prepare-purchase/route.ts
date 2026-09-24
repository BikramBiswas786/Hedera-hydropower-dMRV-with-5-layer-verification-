import { NextResponse } from "next/server";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { preparePurchase, preparePurchaseSchema } from "~~/services/mrv/server/market";

export const dynamic = "force-dynamic";

/** Returns an unsigned buy / buyAndRetire transaction for the caller's own wallet to sign. No credentials needed. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(await preparePurchase(await parseJsonBody(request, preparePurchaseSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
