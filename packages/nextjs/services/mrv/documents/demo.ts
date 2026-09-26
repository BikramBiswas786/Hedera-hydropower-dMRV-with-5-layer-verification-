import { type Document, type DocumentType, sealDocument } from "./envelope";
import { type Hex, keccak256, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Demo document seal. Derived at runtime so a secret scanner does not flag a
 * well-known test key. This key signs illustrative VCS sections only. It is
 * not a meter key and not an operator key.
 */
export const DEMO_DOCUMENT_KEY: Hex = keccak256(stringToBytes("hydro-dmrv demo document seal"));

const CHAIN: Array<{ type: DocumentType; sections: Record<string, string> }> = [
  {
    type: "project-description",
    sections: {
      "1.1": "Grid-connected run-of-river hydropower. VCS project description, illustrative.",
      "3.2": "VMR0017 with ACM0002 v22.0. Hydro at or under 15 MW in an LDC, or the CDM path for comparison.",
      "3.5": "VT0008 additionality is recorded in the design hash. A validation body still has to agree.",
    },
  },
  {
    type: "validation-report",
    sections: {
      "1": "Validation opinion, illustrative. The auditor does not live in this demo key.",
      "4": "No unresolved material misstatement in the demo design.",
    },
  },
  {
    type: "registry-decision",
    sections: { "1": "Listed for demonstration. This is not a Verra registration." },
  },
  {
    type: "monitoring-report",
    sections: {
      "5.1": "Baseline from monitored generation and the registered grid factor.",
      "5.2": "Project emissions from reservoir and fossil backup, per the registered methodology.",
      "5.3": "Leakage from the embodied factor when the methodology requires it.",
      "5.5": "Net reductions are what the contract recomputes. This document does not mint.",
    },
  },
  {
    type: "verification-report",
    sections: {
      "1": "Verification opinion, illustrative.",
      "5": "Figures match the public HCS report for the linked attestation.",
    },
  },
];

export async function demoDocuments(subjectId: string, creditsKg: number): Promise<Document[]> {
  const account = privateKeyToAccount(DEMO_DOCUMENT_KEY);
  const sealed: Document[] = [];
  let previousHash: Document["previousHash"] = null;
  for (const step of CHAIN) {
    const sections = { ...step.sections };
    if (step.type === "verification-report") sections["5"] += ` Issued ${creditsKg} kg on the hydro registry.`;
    const role =
      step.type === "validation-report"
        ? "auditor"
        : step.type === "registry-decision"
          ? "registry"
          : step.type === "verification-report"
            ? "verifier"
            : "proponent";
    const doc = await sealDocument(
      {
        type: step.type,
        subjectId,
        role,
        sections,
        previousHash,
        issuer: account.address as `0x${string}`,
      },
      account,
    );
    sealed.push(doc);
    previousHash = doc.hash ?? null;
  }
  return sealed;
}
