import { POST as assess } from "../../../app/api/methodology/assess/route";
import { POST as verify } from "../../../app/api/mrv/verify/route";
import { DEMO_DESIGNS } from "../demo";
import { PREVIEW_METER_DOMAIN, generateScenario } from "../scenarios";
import { describe, expect, it } from "vitest";

/**
 * A Guardian Http Request Block does not send a verifiable credential here. It sends this API's JSON.
 * These tests are that body, the same one `GET /api/mrv/scenarios/healthy` returns.
 */
const end = new Date("2026-09-20T00:00:00Z");

async function post(handler: (request: Request) => Promise<Response>, path: string, body: unknown) {
  return handler(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("Guardian Http Request Block", () => {
  it("assesses a VMR0017 design and returns the integers registerPlant expects", async () => {
    const response = await post(assess, "/api/methodology/assess", DEMO_DESIGNS[0]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.assessment.eligible).toBe(true);
    expect(body.assessment.failures).toEqual([]);
    expect(body.registration.methodology).toBe(1);
    expect(body.designHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("verifies a monitoring body and refuses one the physics rejects", async () => {
    const healthy = generateScenario("healthy", { end, domain: PREVIEW_METER_DOMAIN });
    const accepted = await post(verify, "/api/mrv/verify", healthy);
    expect(accepted.status).toBe(200);
    const report = await accepted.json();
    expect(report.report.decision).toBe("APPROVED");
    expect(report.report.emissions.unitsMinted).toBeGreaterThan(0);
    expect(report.reportHash).toMatch(/^0x[0-9a-f]{64}$/);

    const inflated = generateScenario("inflated", { end, domain: PREVIEW_METER_DOMAIN });
    const refused = await post(verify, "/api/mrv/verify", inflated);
    expect(refused.status).toBe(200);
    expect((await refused.json()).report.decision).toBe("REJECTED");
  });
});
