import { NextResponse } from "next/server";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";
import { reproduceRecord } from "~~/services/mrv/server/verification";

export const dynamic = "force-dynamic";

/**
 * Re-runs the engine on the readings published to HCS for monitoring record `id`, checks they were quantified with
 * the plant's registered design and meter, recomputes the record's hash-chain link, and compares every figure with
 * the report and the contract.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = intParam((await params).id, 0, Number.MAX_SAFE_INTEGER);
    return NextResponse.json(await reproduceRecord(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
