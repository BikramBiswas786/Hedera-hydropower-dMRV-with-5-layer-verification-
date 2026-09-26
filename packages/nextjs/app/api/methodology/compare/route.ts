import { NextResponse } from "next/server";
import { compareGuardianReport, compareReportSchema } from "~~/services/mrv/guardian/compare";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

/** Recomputes a Guardian VMR0017 monitoring report. Does not mint and does not sign. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(compareGuardianReport(await parseJsonBody(request, compareReportSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
