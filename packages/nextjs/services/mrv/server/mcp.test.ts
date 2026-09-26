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
  "reproduce_attestation",
  "list_open_listings",
  "get_dex_price",
  "prepare_purchase",
  "get_retirement_certificate",
  "get_portfolio",
  "list_documents",
  "get_trust_chain",
  "prepare_document",
  "quantify_safe_water",
  "check_document",
  "run_public_work",
];

describe("agent tool list", () => {
  it("lists the public tools, including prepare_purchase, and no write tools", () => {
    const listed = tools(false);
    expect(Object.keys(listed).sort()).toEqual([...PUBLIC].sort());
    expect(listed.prepare_purchase).toBeDefined();
    expect(listed.submit_attestation).toBeUndefined();
    expect(listed.publish_document).toBeUndefined();
  });

  it("marks every public tool read-only", () => {
    for (const [name, tool] of Object.entries(tools(false))) {
      expect(tool.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it("adds the two authenticated write tools only when the bearer was accepted", () => {
    const listed = tools(true);
    expect(Object.keys(listed).sort()).toEqual([...PUBLIC, "publish_document", "submit_attestation"].sort());
    expect(listed.submit_attestation.annotations?.readOnlyHint).toBe(false);
    expect(listed.publish_document.annotations?.readOnlyHint).toBe(false);
  });
});
