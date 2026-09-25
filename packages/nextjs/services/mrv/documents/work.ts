import { trustChainFor } from "./server";
import { DEMO_WATER, quantifySafeWater } from "../water/vmr0015";

export async function runPublicWork(subjectId: string) {
  const chain = await trustChainFor(subjectId);
  const water = subjectId.startsWith("WATER") ? quantifySafeWater({ ...DEMO_WATER, projectId: subjectId }) : null;
  return {
    subjectId,
    steps: [
      { name: "Describe", detail: "Project description sections follow the VCS project-description numbering." },
      { name: "Validate", detail: "An auditor's opinion cites the description hash." },
      {
        name: "Register",
        detail: "A registry decision cites the validation hash. Hydro plants are also registered on the contract.",
      },
      { name: "Monitor", detail: "Hydro tonnes come from verify_telemetry and the contract. This step does not mint." },
      {
        name: "Verify",
        detail: water
          ? `${water.creditsTonnes.toLocaleString("en-US")} t illustrative from the VMR0015 equation. Not a hydro credit.`
          : `Document chain status: ${chain.status}.`,
      },
    ],
    chain,
    water,
  };
}
