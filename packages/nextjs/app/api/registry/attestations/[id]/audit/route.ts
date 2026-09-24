import { NextResponse } from "next/server";
import { auditAttestation } from "~~/services/mrv/audit";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";
import { getAttestation } from "~~/services/mrv/server/registry";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = intParam((await params).id, 0, Number.MAX_SAFE_INTEGER);
    return NextResponse.json(await auditAttestation(await getAttestation(id)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
