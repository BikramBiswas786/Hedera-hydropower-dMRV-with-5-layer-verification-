import { NextResponse } from "next/server";
import { prepareCheckoutPurchase, prepareCheckoutPurchaseSchema } from "~~/services/mrv/server/checkout";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

export const dynamic = "force-dynamic";

/** An unsigned UsdCheckout.buy for your own wallet; 409 when the token's Guardian claim is not backed. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(
      await prepareCheckoutPurchase(await parseJsonBody(request, prepareCheckoutPurchaseSchema)),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
