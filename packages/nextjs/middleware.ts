import { type NextRequest, NextResponse } from "next/server";
import { clientKey, takeApiSlot } from "./services/mrv/server/apiLimit";

/** Bounds `/api/*` on this instance. A public deployment still wants a firewall: isolates do not share the counter. */
export function middleware(request: NextRequest) {
  const slot = takeApiSlot(clientKey(request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip")));
  if (slot.ok) return NextResponse.next();
  return NextResponse.json(
    { error: "Too many requests. This instance allows 300 API calls per minute." },
    {
      status: 429,
      headers: { "retry-after": String(slot.retryAfterSec), "cache-control": "no-store" },
    },
  );
}

export const config = { matcher: "/api/:path*" };
