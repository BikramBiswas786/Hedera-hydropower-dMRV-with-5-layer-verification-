import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { DEMO_DOCUMENT_KEY, demoDocuments } from "./demo";
import { documentIsIntact, sealDocument } from "./envelope";
import { deriveTrustChain } from "./workflow";
import { DEMO_WATER, quantifySafeWater } from "../water/vmr0015";

describe("document trust chain", () => {
  it("seals the five VCS documents for a demo plant", async () => {
    const docs = await demoDocuments("HYDRO-DEMO-01", 4791);
    expect(docs).toHaveLength(5);
    for (const doc of docs) expect(await documentIsIntact(doc)).toBe(true);
    const chain = await deriveTrustChain("HYDRO-DEMO-01", docs, 4791);
    expect(chain.status).toBe("issued");
    expect(chain.creditsKg).toBe(4791);
  });

  it("breaks when a sealed section is edited", async () => {
    const docs = await demoDocuments("HYDRO-DEMO-01", 4791);
    docs[0] = { ...docs[0], sections: { ...docs[0].sections, "1.1": "edited after sealing" } };
    const chain = await deriveTrustChain("HYDRO-DEMO-01", docs, 4791);
    expect(chain.status).toBe("broken");
  });

  it("rejects a document signed by the wrong role label", async () => {
    const account = privateKeyToAccount(DEMO_DOCUMENT_KEY);
    const doc = await sealDocument(
      {
        type: "validation-report",
        subjectId: "X",
        role: "proponent",
        sections: { "1": "wrong role" },
        previousHash: null,
        issuer: account.address,
      },
      account,
    );
    expect(await documentIsIntact(doc)).toBe(false);
  });
});

describe("VMR0015 safe water", () => {
  it("discounts a project-specific biomass fraction by 26 percent", () => {
    const result = quantifySafeWater(DEMO_WATER);
    expect(result.fnrb).toBeCloseTo(0.8 * 0.74, 10);
    expect(result.creditsTonnes).toBe(Math.floor(result.reductionT));
    expect(result.creditsTonnes).toBeGreaterThan(0);
  });

  it("issues nothing when fewer than 90 percent of appliances pass", () => {
    expect(quantifySafeWater({ ...DEMO_WATER, appliancesPassed: 80 }).creditsTonnes).toBe(0);
  });

  it("caps quantity at 5.5 litres per person per day", () => {
    const result = quantifySafeWater({ ...DEMO_WATER, litresPerPersonDay: 20 });
    expect(result.capBinding).toBe(true);
    expect(result.qpwLitres).toBe(Math.round(2_000 * 5.5 * 365));
  });
});
