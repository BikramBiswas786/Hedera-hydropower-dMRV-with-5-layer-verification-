import { NextResponse } from "next/server";
import { prepareAnchors } from "~~/services/mrv/pipeline";
import { verifyRequestSchema } from "~~/services/mrv/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

/** Runs the 5-layer verification and builds both HCS messages without writing anything. No credentials needed. */
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
