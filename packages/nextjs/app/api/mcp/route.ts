import { createMcpHandler } from "@modelcontextprotocol/server";
import { isAuthorized } from "~~/services/mrv/server/config";
import { buildMcpServer } from "~~/services/mrv/server/mcp";

export const maxDuration = 60;

/**
 * Streamable-HTTP MCP endpoint. Read-only tools are public; the write tools (`record_monitoring`,
 * `prepare_verification`, `submit_verification`) are only listed for requests that carry
 * `Authorization: Bearer $MRV_API_KEY`.
 */
const handler = createMcpHandler(({ requestInfo }) =>
  buildMcpServer({ canWrite: isAuthorized(requestInfo?.headers.get("authorization") ?? null) }),
);

export const GET = (request: Request) => handler.fetch(request);
export const POST = (request: Request) => handler.fetch(request);
export const DELETE = (request: Request) => handler.fetch(request);
