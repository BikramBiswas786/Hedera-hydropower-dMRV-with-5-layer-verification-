import { DEMO_DESIGNS } from "../demo";
import { MethodologyError } from "../methodology/errors";
import { type ProjectDesign, assessProject } from "../methodology/project";
import { gridEmissionFactorRequestSchema, projectDesignSchema } from "../methodology/schema";
import { calculateGridEmissionFactor } from "../methodology/tool07";
import { buildProjectMessage } from "../report";
import { plantIdToBytes32 } from "../views";
import { ApiError } from "./errors";
import { getPlant } from "./registry";
import type { z } from "zod";

/** Wraps methodology refusals (e.g. simple OM on a hydro-dominated grid) as caller errors. */
function asCallerError<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof MethodologyError) throw new ApiError(error.message, 400);
    throw error;
  }
}

export function assessDesign(input: z.input<typeof projectDesignSchema>) {
  const design = projectDesignSchema.parse(input) as ProjectDesign;
  return asCallerError(() => {
    const assessment = assessProject(design);
    const { designHash } = buildProjectMessage(design);
    return { assessment, designHash, registration: { ...assessment.registration, designHash } };
  });
}

export function gridEmissionFactor(input: z.input<typeof gridEmissionFactorRequestSchema>) {
  const request = gridEmissionFactorRequestSchema.parse(input);
  return asCallerError(() => calculateGridEmissionFactor(request));
}

export type ProjectRecord = {
  plantId: string;
  design: ProjectDesign;
  designHash: string;
  /** SHA-256 of `document`; equals the on-chain `designHash` when the registration is honest. */
  document: string;
  assessment: ReturnType<typeof assessProject>;
  /** Null when the registry is not deployed on this chain or the plant is not registered. */
  onChain: { registered: boolean; designHashMatches: boolean } | null;
};

/** The design documents of the plants this app ships with, checked against their on-chain registration. */
export async function getProjects(): Promise<ProjectRecord[]> {
  return Promise.all(DEMO_DESIGNS.map(design => getProjectRecord(design)));
}

export async function getProject(plantId: string): Promise<ProjectRecord> {
  const design = DEMO_DESIGNS.find(d => d.plantId === plantId);
  if (!design) throw new ApiError(`No design document for ${plantId}`, 404);
  return getProjectRecord(design);
}

async function getProjectRecord(design: ProjectDesign): Promise<ProjectRecord> {
  const { message, designHash } = buildProjectMessage(design);
  const plant = await getPlant(plantIdToBytes32(design.plantId)).catch(() => undefined);
  return {
    plantId: design.plantId,
    design,
    designHash,
    document: message,
    assessment: assessProject(design),
    onChain:
      plant === undefined ? null : { registered: plant !== null, designHashMatches: plant?.designHash === designHash },
  };
}
