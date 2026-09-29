import { NextResponse } from "next/server";
import { getEngine } from "~~/services/mrv/server/engines";
import { toErrorResponse } from "~~/services/mrv/server/http";

/** One engine and a ready-to-verify example input for it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(getEngine((await params).id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
