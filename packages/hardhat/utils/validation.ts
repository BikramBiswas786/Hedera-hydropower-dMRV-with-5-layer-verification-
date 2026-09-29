import { Wallet, keccak256, sha256, toUtf8Bytes } from "ethers";
import type { DemoPlant } from "./demoPlants";

/**
 * VCS validation, as the registry sees it: a VVB signs a `ValidationApproval` over the project design, the module
 * parameters and the SHA-256 of its validation report. On a real project that report is the VVB's validation report
 * on the Verra registry. For the demo plants it is the short statement below, which says exactly what was and was
 * not checked, and the key that signs it is a labelled demo key.
 */
export function demoValidationReport(plant: DemoPlant, network: string): string {
  return JSON.stringify({
    schema: "hydro-dmrv/validation@1",
    kind: "ILLUSTRATIVE DEMO VALIDATION: not a VVB validation report",
    network,
    plantId: plant.plantId,
    designHash: plant.design.designHash,
    methodology: plant.design.methodology === 1 ? "VMR0017 v1.0 with ACM0002 v22.0" : "CDM ACM0002 / AMS-I.D",
    checked: [
      "VMR0017 Table 1: hydro, <= 15 MW by the higher of rated and authorized capacity, UN LDC host country",
      "ACM0002 power density and PE_HP rate",
      "VT0008 evidence present (regulatory surplus, benchmark analysis, common practice): illustrative figures",
      "VT0011 combined margin recomputed from the design's grid data",
    ],
    notChecked: [
      "Site visit, legal ownership, stakeholder consultation and safeguards evidence",
      "Authenticity of the grid, financial and common-practice data",
    ],
  });
}

export const validationReportHashOf = (report: string) => sha256(toUtf8Bytes(report));

/**
 * PUBLIC local VVB key, derived from a fixed string: the local deploy uses it to validate and verify the demo
 * plants. It is refused on Hedera networks, where VERIFIER_ADDRESS names the VVB.
 */
export const LOCAL_VVB = new Wallet(keccak256(toUtf8Bytes("hydro-dmrv demo vvb local")));
