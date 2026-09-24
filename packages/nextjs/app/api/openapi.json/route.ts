import { NextResponse } from "next/server";
import { buildOpenApi } from "~~/services/mrv/server/openapi";

/** OpenAPI 3.1 description of the REST API, open to any origin so API explorers and agents can load it. */
export function GET(request: Request) {
  return NextResponse.json(buildOpenApi(new URL(request.url).origin), {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" },
  });
}
