import { NextResponse } from "next/server";
import { prepareAnchors } from "~~/services/mrv/pipeline";
import { verifyRequestSchema } from "~~/services/mrv/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

/**
 * Verifies and quantifies a monitoring period and builds both HCS messages without writing anything.
 * No credentials needed. A Guardian Http Request Block can POST this body; see docs/GUARDIAN.md.
 */
export async function POST(request: Request) {
  try {
    const { report, data, preview } = prepareAnchors(await parseJsonBody(request, verifyRequestSchema));
    return NextResponse.json({
      report,
      hcsMessage: preview.message,
      reportHash: preview.reportHash,
      dataHash: data.dataHash,
      dataChunks: data.chunks,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
