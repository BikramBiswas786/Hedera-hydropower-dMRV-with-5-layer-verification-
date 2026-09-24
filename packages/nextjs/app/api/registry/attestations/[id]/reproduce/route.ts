import { NextResponse } from "next/server";
import { reproduceAttestation } from "~~/services/mrv/audit";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";
import { getAttestation, getPlant } from "~~/services/mrv/server/registry";
import { plantIdToBytes32 } from "~~/services/mrv/views";

export const dynamic = "force-dynamic";

/**
 * Re-runs the engine on the readings published to HCS, checks they were quantified with the plant's registered
 * design, and compares every figure with the report and the contract.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = intParam((await params).id, 0, Number.MAX_SAFE_INTEGER);
    const attestation = await getAttestation(id);
    const plant = await getPlant(plantIdToBytes32(attestation.plantId));
    return NextResponse.json(await reproduceAttestation(attestation, fetch, plant?.design));
  } catch (error) {
    return toErrorResponse(error);
  }
}
