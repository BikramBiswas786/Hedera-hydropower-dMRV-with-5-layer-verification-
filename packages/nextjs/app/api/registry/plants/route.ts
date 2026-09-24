import { NextResponse } from "next/server";
import { toErrorResponse } from "~~/services/mrv/server/http";
import { listPlants } from "~~/services/mrv/server/insights";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ plants: await listPlants() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
