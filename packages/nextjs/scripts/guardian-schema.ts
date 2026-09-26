/**
 * Writes the "DMRV Cross-Check Result" Guardian schema to the repo's docs/guardian/:
 *
 *   dmrv-cross-check-result.schema.json   reference: Guardian JSON-schema document + the JSON-LD context it implies
 *   DMRV Cross-Check Result.xlsx          Guardian 3.7.0 Excel import (Schemas → Import → Import from Excel)
 *
 *   yarn guardian:schema
 *
 * Guardian assigns its own uuid and IPFS context when you import and publish; the reference file uses a fixed
 * placeholder uuid. After publishing, copy the schema's `iri`/uuid and context URL into GUARDIAN_BRIDGE_RESULT_SCHEMA.
 */
import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
  BRIDGE_VERSION,
  RESULT_FIELDS,
  RESULT_SCHEMA_DESCRIPTION,
  RESULT_SCHEMA_NAME,
  buildResultSchemaContext,
  buildResultSchemaDocument,
} from "~~/services/mrv/guardian/resultSchema";
import { buildResultSchemaWorkbook } from "~~/services/mrv/guardian/workbook";

export const REFERENCE_UUID = "5c1d6a3e-0d6b-4c55-9b1e-6d4d6d52a001";

async function main() {
  const out = resolve(process.cwd(), "../../docs/guardian");
  mkdirSync(out, { recursive: true });
  const reference = {
    name: RESULT_SCHEMA_NAME,
    description: RESULT_SCHEMA_DESCRIPTION,
    entity: "VC",
    bridgeVersion: BRIDGE_VERSION,
    note: "Reference only. Import the .xlsx (or recreate these fields) in Guardian; Guardian assigns its own uuid and context URL.",
    fields: RESULT_FIELDS.map(({ key, type, required, isArray, enum: values, description }) => ({
      key,
      type,
      required,
      isArray: Boolean(isArray),
      ...(values ? { enum: values } : {}),
      description,
    })),
    document: buildResultSchemaDocument(REFERENCE_UUID, "1.0.0"),
    context: buildResultSchemaContext(REFERENCE_UUID),
  };
  const jsonPath = resolve(out, "dmrv-cross-check-result.schema.json");
  writeFileSync(jsonPath, JSON.stringify(reference, null, 2) + "\n");
  const xlsxPath = resolve(out, `${RESULT_SCHEMA_NAME}.xlsx`);
  const workbook = buildResultSchemaWorkbook();
  // Fixed timestamps so regenerating produces the same bytes.
  workbook.created = workbook.modified = new Date("2026-01-01T00:00:00Z");
  await workbook.xlsx.writeFile(xlsxPath);
  console.log(`wrote ${jsonPath}\nwrote ${xlsxPath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
