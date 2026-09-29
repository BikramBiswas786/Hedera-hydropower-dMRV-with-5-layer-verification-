import { NextResponse } from "next/server";
import { listEngines } from "~~/services/mrv/server/engines";

/** The methodology engines this deployment runs, each with its documents and on-chain module. */
export function GET() {
  return NextResponse.json(listEngines());
}
