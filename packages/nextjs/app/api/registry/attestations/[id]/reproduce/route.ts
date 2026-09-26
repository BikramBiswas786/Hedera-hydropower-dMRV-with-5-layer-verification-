import { NextResponse } from "next/server";
import { reproduceAttestation } from "~~/services/mrv/audit";
import { intParam, toErrorResponse } from "~~/services/mrv/server/http";
import { getAttestation, getPlant, registryAt } from "~~/services/mrv/server/registry";
import { plantIdToBytes32 } from "~~/services/mrv/views";

export const dynamic = "force-dynamic";

/**
 * Re-runs the engine on the readings published to HCS, checks they were quantified with the plant's registered
 * design, and compares every figure with the report and the contract. `?registry=<address>` selects the legacy
 * HydroCreditRegistry for historic evidence; the default is the active registry.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = intParam((await params).id, 0, Number.MAX_SAFE_INTEGER);
    const registry = registryAt(new URL(request.url).searchParams.get("registry"));
    const attestation = await getAttestation(id, registry);
    const plant = await getPlant(plantIdToBytes32(attestation.plantId), registry);
    return NextResponse.json({
      registry,
      ...(await reproduceAttestation(attestation, fetch, plant?.design, plant?.meter)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
