import { NextResponse } from "next/server";
import { runEngine } from "~~/services/mrv/server/engines";
import { BadRequestError, toErrorResponse } from "~~/services/mrv/server/http";

/**
 * Verifies a monitoring period with one methodology engine and returns its report: decision, findings with the clause
 * each enforces, and the methodology's data and parameters table. Writes nothing; no credentials.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new BadRequestError("Request body must be JSON");
    }
    return NextResponse.json(runEngine((await params).id, body));
  } catch (error) {
    return toErrorResponse(error);
  }
}
