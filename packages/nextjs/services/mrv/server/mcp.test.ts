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
  "list_open_listings",
  "get_dex_price",
  "prepare_purchase",
  "list_checkout_listings",
  "prepare_checkout_purchase",
  "get_retirement_certificate",
  "get_portfolio",
  "approve_attestation",
  "list_methodology_engines",
  "get_methodology_engine",
  "verify_with_engine",
];

describe("agent tool list", () => {
  it("lists the public tools, including prepare_purchase, and no write tools", () => {
    const listed = tools(false);
    expect(Object.keys(listed).sort()).toEqual([...PUBLIC].sort());
    expect(listed.prepare_purchase).toBeDefined();
    expect(listed.submit_attestation).toBeUndefined();
  });

  it("marks every public tool read-only", () => {
    for (const [name, tool] of Object.entries(tools(false))) {
      expect(tool.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it("adds the authenticated write tool only when the bearer was accepted", () => {
    const listed = tools(true);
    expect(Object.keys(listed).sort()).toEqual([...PUBLIC, "submit_attestation"].sort());
    expect(listed.submit_attestation.annotations?.readOnlyHint).toBe(false);
  });
});

describe("approve_attestation", () => {
  it("is read-only: a VVB previews the typed data, the server never signs it", () => {
    const tool = tools(false).approve_attestation;
    expect(tool.annotations?.readOnlyHint).toBe(true);
  });
});
