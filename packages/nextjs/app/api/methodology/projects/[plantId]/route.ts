import { NextResponse } from "next/server";
import { toErrorResponse } from "~~/services/mrv/server/http";
import { getProject } from "~~/services/mrv/server/methodology";

export const dynamic = "force-dynamic";

/**
 * One design document. `?raw=1` returns the exact bytes whose SHA-256 is the plant's on-chain `designHash`, so
 * `curl …?raw=1 | sha256sum` can be compared with `getPlant(id).design.designHash`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ plantId: string }> }) {
  try {
    const project = await getProject((await params).plantId);
    if (new URL(request.url).searchParams.get("raw")) {
      return new NextResponse(project.document, { headers: { "content-type": "application/json" } });
    }
    return NextResponse.json(project);
  } catch (error) {
    return toErrorResponse(error);
  }
}
