import { buildMcpServer } from "./mcp";
import { describe, expect, it } from "vitest";

type Registered = {
  annotations?: { readOnlyHint?: boolean };
  enabled?: boolean;
};

function tools(canWrite: boolean): Record<string, Registered> {
  const server = buildMcpServer({ canWrite }) as unknown as {
    _registeredTools: Record<string, Registered>;
  };
  return server._registeredTools;
}

const PUBLIC = [
  "list_scenarios",
  "generate_sample_telemetry",
  "verify_telemetry",
  "assess_project",
  "calculate_grid_emission_factor",
  "get_project_design",
  "get_registry_overview",
  "get_plant",
  "list_attestations",
  "audit_attestation",
  "verify_guardian_evidence",
  "trace_guardian_mint",
  "compare_guardian_report",
  "reproduce_attestation",
  "list_issuances",
  "get_pending_verification",
  "list_open_listings",
  "get_dex_price",
  "prepare_purchase",
  "get_credit_pool",
  "prepare_dex_retire",
  "list_checkout_listings",
  "prepare_checkout_purchase",
  "get_retirement_certificate",
  "get_portfolio",
  "list_methodology_engines",
  "get_methodology_engine",
  "verify_with_engine",
];

/** Record, publish a verification report, relay a VVB signature. None signs as the VVB. */
const WRITE = ["record_monitoring", "prepare_verification", "submit_verification"];

describe("agent tool list", () => {
  it("lists the public tools, including prepare_purchase, and no write tools", () => {
    const listed = tools(false);
    expect(Object.keys(listed).sort()).toEqual([...PUBLIC].sort());
    expect(listed.prepare_purchase).toBeDefined();
    for (const write of WRITE) expect(listed[write], write).toBeUndefined();
  });

  it("marks every public tool read-only", () => {
    for (const [name, tool] of Object.entries(tools(false))) {
      expect(tool.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it("adds the authenticated write tools only when the bearer was accepted", () => {
    const listed = tools(true);
    expect(Object.keys(listed).sort()).toEqual([...PUBLIC, ...WRITE].sort());
    for (const write of WRITE) expect(listed[write].annotations?.readOnlyHint, write).toBe(false);
  });
});
