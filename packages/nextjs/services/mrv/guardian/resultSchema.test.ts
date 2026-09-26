import {
  RESULT_FIELDS,
  RESULT_SCHEMA_NAME,
  buildResultSchemaContext,
  buildResultSchemaDocument,
  checkResultSubject,
} from "./resultSchema";
import { ENUM_HEADERS, FIELD_HEADERS, HEADER_ROW, buildResultSchemaWorkbook } from "./workbook";
import ExcelJS from "exceljs";
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const UUID = "5c1d6a3e-0d6b-4c55-9b1e-6d4d6d52a001";

/** Spec §5.2.3 field list. */
const SPEC_FIELDS = [
  "bridgeVersion",
  "decision",
  "methodologyId",
  "moduleVersion",
  "sourceVcId",
  "sourceVcHash",
  "oursBEt",
  "oursPEt",
  "oursLEt",
  "oursERt",
  "theirsBEt",
  "theirsPEt",
  "theirsLEt",
  "theirsERt",
  "deltaERg",
  "notes",
  "registryAddress",
  "projectId",
  "attestationIds",
  "issuerOfRecord",
];

describe("DMRV Cross-Check Result schema", () => {
  it("has exactly the spec's fields, no dotted keys, and a name that fits an Excel sheet", () => {
    expect(RESULT_FIELDS.map(f => f.key)).toEqual(SPEC_FIELDS);
    expect(RESULT_FIELDS.every(f => !f.key.includes("."))).toBe(true);
    expect(RESULT_SCHEMA_NAME.length).toBeLessThanOrEqual(30);
  });

  it("builds a Guardian schema document that forbids extra properties", () => {
    const doc = buildResultSchemaDocument(UUID, "1.0.0");
    expect(doc.$id).toBe(`#${UUID}&1.0.0`);
    expect(doc.additionalProperties).toBe(false);
    expect(doc.required).toEqual(
      expect.arrayContaining(["@context", "type", "decision", "issuerOfRecord", "sourceVcHash"]),
    );
    expect(doc.required).not.toContain("notes");
    expect((doc.properties.decision as { enum: string[] }).enum).toEqual(["MATCH", "MISMATCH", "NOT_COMPARABLE"]);
    const context = buildResultSchemaContext(UUID)["@context"] as Record<string, any>;
    expect(context["@vocab"]).toBe("https://w3id.org/traceability/#undefinedTerm");
    expect(Object.keys(context[UUID]["@context"])).toEqual(expect.arrayContaining(SPEC_FIELDS));
  });

  it("checks a subject the way Guardian's ajv verifySchema would", () => {
    const good = {
      bridgeVersion: "guardian-bridge@1",
      decision: "MATCH",
      methodologyId: "m",
      moduleVersion: 1,
      sourceVcId: "urn:x",
      sourceVcHash: "0x00",
      oursBEt: 1,
      oursPEt: 0,
      oursLEt: 0,
      oursERt: 1,
      theirsBEt: 1,
      theirsPEt: 0,
      theirsLEt: 0,
      theirsERt: 1,
      deltaERg: 0,
      issuerOfRecord: "DMRV",
      "@context": ["ipfs://x"],
      id: "urn:y",
      type: `${UUID}&1.0.0`,
    };
    expect(checkResultSubject(good)).toEqual([]);
    expect(checkResultSubject({ ...good, decision: "OK" })).toEqual(["decision is not a valid Enum"]);
    expect(checkResultSubject({ ...good, moduleVersion: 1.5 })).toEqual(["moduleVersion is not a valid Integer"]);
    expect(checkResultSubject({ ...good, notes: "x" })).toEqual(["notes is not a valid String[]"]);
    expect(checkResultSubject({ ...good, extra: 1 })).toEqual(["unexpected property extra"]);
    const missing: Record<string, unknown> = { ...good };
    delete missing.sourceVcHash;
    expect(checkResultSubject(missing)).toEqual(["missing sourceVcHash"]);
  });
});

describe("Guardian Excel import workbook (3.7.0 layout)", () => {
  it("lays out the name, description, type, field header row and one row per field", () => {
    const sheet = buildResultSchemaWorkbook().getWorksheet(RESULT_SCHEMA_NAME)!;
    expect(sheet.getCell("A1").value).toBe(RESULT_SCHEMA_NAME);
    expect(sheet.getCell("A2").value).toBe("Schema Description");
    expect([sheet.getCell("A3").value, sheet.getCell("B3").value]).toEqual(["Schema Type", "Verifiable Credentials"]);
    expect((sheet.getRow(HEADER_ROW).values as unknown[]).slice(1)).toEqual([...FIELD_HEADERS]);
    const rows = RESULT_FIELDS.map((_, i) => (sheet.getRow(HEADER_ROW + 1 + i).values as unknown[]).slice(1));
    expect(rows.map(r => r[9])).toEqual(SPEC_FIELDS);
    expect(rows.find(r => r[9] === "decision")).toEqual([
      "Yes",
      "Enum",
      "DMRV Decision",
      "",
      "Cross-check result",
      "No",
      "MATCH",
      "",
      "",
      "decision",
    ]);
    expect(rows.find(r => r[9] === "notes")?.slice(0, 2)).toEqual(["No", "String"]);
    expect(rows.find(r => r[9] === "notes")?.[5]).toBe("Yes");
    expect(rows.every(r => ["Yes", "No"].includes(r[0] as string) && ["Yes", "No"].includes(r[5] as string))).toBe(
      true,
    );
  });

  it("puts enums in a shared Enums sheet, name on the first row of each group", () => {
    const enums = buildResultSchemaWorkbook().getWorksheet("Enums")!;
    const rows: unknown[][] = [];
    enums.eachRow(row => rows.push((row.values as unknown[]).slice(1)));
    expect(rows).toEqual([
      [...ENUM_HEADERS],
      ["DMRV Decision", "No", "MATCH"],
      ["", "", "MISMATCH"],
      ["", "", "NOT_COMPARABLE"],
      ["DMRV Issuer Of Record", "No", "DMRV"],
    ]);
  });

  it("matches the committed docs/guardian artifacts (run `yarn guardian:schema` after changing fields)", async () => {
    const dir = resolve(__dirname, "../../../../../docs/guardian");
    const committed = JSON.parse(readFileSync(resolve(dir, "dmrv-cross-check-result.schema.json"), "utf8"));
    expect(committed.document).toEqual(JSON.parse(JSON.stringify(buildResultSchemaDocument(UUID, "1.0.0"))));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(resolve(dir, `${RESULT_SCHEMA_NAME}.xlsx`));
    const keys: unknown[] = [];
    workbook.getWorksheet(RESULT_SCHEMA_NAME)!.eachRow((row, n) => n > HEADER_ROW && keys.push(row.getCell(10).value));
    expect(keys).toEqual(SPEC_FIELDS);
  });
});
