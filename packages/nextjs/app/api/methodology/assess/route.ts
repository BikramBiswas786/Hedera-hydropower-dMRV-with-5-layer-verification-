import { NextResponse } from "next/server";
import { projectDesignSchema } from "~~/services/mrv/methodology/schema";
import { parseJsonBody, toErrorResponse } from "~~/services/mrv/server/http";
import { assessDesign } from "~~/services/mrv/server/methodology";

/**
 * Assesses a project design (VMR0017, or the CDM AMS-I.D / ACM0002 path) and returns the integers
 * `registerPlant` expects plus the design hash. No credentials needed.
 */
export async function POST(request: Request) {
  try {
    return NextResponse.json(assessDesign(await parseJsonBody(request, projectDesignSchema)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
