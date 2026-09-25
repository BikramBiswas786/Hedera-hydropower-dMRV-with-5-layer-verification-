import { NextResponse } from "next/server";
import { trustChainFor } from "~~/services/mrv/documents/server";
import { toErrorResponse } from "~~/services/mrv/server/http";

export async function GET(_request: Request, context: { params: Promise<{ subjectId: string }> }) {
  try {
    const { subjectId } = await context.params;
    return NextResponse.json(await trustChainFor(decodeURIComponent(subjectId)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
