import { NextResponse } from "next/server";
import { listCheckoutListings } from "~~/services/mrv/server/checkout";
import { toErrorResponse } from "~~/services/mrv/server/http";

export const dynamic = "force-dynamic";

/** Open UsdCheckout listings, each with its token's Guardian verdict (backed, none, not-backed, incomplete). */
export async function GET() {
  try {
    return NextResponse.json(await listCheckoutListings());
  } catch (error) {
    return toErrorResponse(error);
  }
}
