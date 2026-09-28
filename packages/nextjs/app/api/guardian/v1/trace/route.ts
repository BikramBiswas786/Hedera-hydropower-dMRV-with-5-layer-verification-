import { NextResponse } from "next/server";
import { traceMint } from "~~/services/mrv/server/guardianBridge";
import { toErrorResponse } from "~~/services/mrv/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The buyer's check on a Guardian-minted token: `?ref=nft:<tokenId>:<serial>`, `ft:<tokenId>:<account>` or a mint
 * transaction id. Answers `verdict: backed | not-backed | incomplete` with every check. Read-only, no credentials.
 */
export async function GET(request: Request) {
  try {
    const ref = new URL(request.url).searchParams.get("ref") ?? "";
    return NextResponse.json(await traceMint(ref), { headers: { "cache-control": "public, max-age=60" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
