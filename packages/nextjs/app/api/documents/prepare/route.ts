import { NextResponse } from "next/server";
import { prepareDocument } from "~~/services/mrv/documents/server";
import { prepareDocumentSchema } from "~~/services/mrv/documents/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

/** Returns the exact hash and message a wallet must sign. Writes nothing. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(prepareDocument(await parseJsonBody(request, prepareDocumentSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
