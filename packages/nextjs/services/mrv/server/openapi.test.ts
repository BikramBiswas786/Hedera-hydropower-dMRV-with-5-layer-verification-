import { buildOpenApi } from "./openapi";
import { readFileSync, readdirSync } from "fs";
import { join, relative, sep } from "path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "../../../app");
/** Transport and plumbing routes that are not part of the documented API. */
const UNDOCUMENTED = ["/api/mcp", "/api/openapi.json", "/api/hedera/account"];

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routes(full);
    if (entry.name !== "route.ts") return [];
    return [`/${relative(APP, dir).split(sep).join("/")}`.replace(/\[(\w+)\]/g, "{$1}")];
  });
}

const spec = buildOpenApi("https://hydro.example");
const operations = Object.values(spec.paths).flatMap(item => Object.values(item));

describe("OpenAPI description", () => {
  it("documents every API route", () => {
    const documented = Object.keys(spec.paths);
    const undocumented = routes(join(APP, "api")).filter(
      route => !documented.includes(route) && !UNDOCUMENTED.includes(route),
    );
    expect(undocumented).toEqual([]);
  });

  it("gives every MCP tool a REST twin with the tool's name as operationId", () => {
    const source = readFileSync(join(__dirname, "mcp.ts"), "utf8");
    const tools = [...source.matchAll(/registerTool\(\s*"(\w+)"/g)].map(match => match[1]);
    expect(tools.length).toBeGreaterThan(10);
    const operationIds = operations.map(op => op.operationId);
    expect(tools.filter(tool => !operationIds.includes(tool))).toEqual([]);
  });

  it("describes request bodies with the schemas that validate them", () => {
    const verify = spec.paths["/api/mrv/verify"].post.requestBody?.content["application/json"].schema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(verify.properties)).toEqual(["readings", "plant", "metering", "ledger", "signature", "domain"]);
    expect(verify.required).toEqual(["readings"]);
  });

  it("requires the operator key only for attestation", () => {
    expect(spec.security).toEqual([]);
    const secured = operations.filter(op => "security" in op).map(op => op.operationId);
    expect(secured.sort()).toEqual(["guardian_cross_check", "publish_document", "submit_attestation"]);
  });
});
