import { NextResponse } from "next/server";
import { runPublicWork } from "~~/services/mrv/documents/work";
import { toErrorResponse } from "~~/services/mrv/server/http";

export async function GET(request: Request) {
  try {
    const subjectId = new URL(request.url).searchParams.get("subjectId") ?? "HYDRO-DEMO-01";
    return NextResponse.json(await runPublicWork(subjectId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
