import { NextResponse } from "next/server";
import { listDocuments, publishDocument } from "~~/services/mrv/documents/server";
import { publishDocumentSchema } from "~~/services/mrv/documents/schema";
import { isAuthorized, writesEnabled } from "~~/services/mrv/server/config";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";

export async function GET(request: Request) {
  try {
    const subjectId = new URL(request.url).searchParams.get("subjectId") ?? undefined;
    return NextResponse.json({ documents: await listDocuments(subjectId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!writesEnabled()) {
    return NextResponse.json({ error: "Publishing is disabled: set MRV_API_KEY on the server" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Missing or invalid bearer token" }, { status: 401 });
  }
  try {
    return NextResponse.json(await publishDocument(await parseJsonBody(request, publishDocumentSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
