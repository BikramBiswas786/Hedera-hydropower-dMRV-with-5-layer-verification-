import { NextResponse } from "next/server";
import { checkSignedDocument } from "~~/services/mrv/documents/server";
import { publishDocumentSchema } from "~~/services/mrv/documents/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

/** Confirms a wallet signature. Does not store the document and does not mint. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(await checkSignedDocument(await parseJsonBody(request, publishDocumentSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
