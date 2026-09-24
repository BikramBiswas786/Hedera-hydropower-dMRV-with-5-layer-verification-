import { NextResponse } from "next/server";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";
import { getRetirementCertificate } from "~~/services/mrv/server/market";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = intParam((await params).id, 0, Number.MAX_SAFE_INTEGER);
    return NextResponse.json(await getRetirementCertificate(id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
