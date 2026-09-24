import { NextResponse } from "next/server";
import { projectDesignSchema } from "~~/services/mrv/methodology/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { assessDesign } from "~~/services/mrv/server/methodology";

/**
 * Assesses a project design against AMS-I.D / ACM0002 (applicability, power density, baseline, TOOL07, TOOL03,
 * leakage, crediting period) and returns the integers `registerPlant` expects plus the design hash.
 */
export async function POST(request: Request) {
  try {
    return NextResponse.json(assessDesign(await parseJsonBody(request, projectDesignSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
