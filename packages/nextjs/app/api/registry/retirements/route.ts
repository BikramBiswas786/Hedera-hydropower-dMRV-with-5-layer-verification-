import { NextResponse } from "next/server";
import { BadRequestError, toErrorResponse } from "~~/services/mrv/server/http";
import { getPortfolio, portfolioCsv } from "~~/services/mrv/server/insights";

export const dynamic = "force-dynamic";

/** `?account=0x…&beneficiary=…&format=json|csv`: retirements for ESG reporting. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = url.searchParams;
    const format = params.get("format") ?? "json";
    if (format !== "json" && format !== "csv") throw new BadRequestError("format must be json or csv");
    const portfolio = await getPortfolio({
      account: params.get("account") ?? undefined,
      beneficiary: params.get("beneficiary") ?? undefined,
    });
    if (format === "json") return NextResponse.json(portfolio);
    return new NextResponse(portfolioCsv(portfolio, url.origin), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="hydro-dmrv-retirements.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
