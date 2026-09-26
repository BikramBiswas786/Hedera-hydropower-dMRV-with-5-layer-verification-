import { RESULT_FIELDS, RESULT_SCHEMA_DESCRIPTION, RESULT_SCHEMA_NAME } from "./resultSchema";
import ExcelJS from "exceljs";

/**
 * Guardian Excel import workbook for the "DMRV Cross-Check Result" schema, in the layout Guardian 3.7.0's
 * XlsxToJson reads (common/src/xlsx/xlsx-to-json.ts and models/, tag 3.7.0; digest §2.2):
 *
 *   row 1  schema name (first column, merged across the table)
 *   row 2  "Schema Description" | text          row 3  "Schema Type" | "Verifiable Credentials"
 *   row 4  field header row, found by "Required Field" in the first column:
 *          Required Field | Field Type | Parameter | Visibility | Description | Allow Multiple Answers |
 *          Test Value | Default Value | Suggest Value | Key
 *   rows   one per field; booleans Yes/No; Enum fields name their enum in Parameter; arrays take "a,b" test values
 *   "Enums" sheet: Enum Name | Loaded to IPFS | Value, name on the first row of each group, one value per row
 *
 * Dev/script only (exceljs is a devDependency); the app never imports this module.
 */

export const FIELD_HEADERS = [
  "Required Field",
  "Field Type",
  "Parameter",
  "Visibility",
  "Description",
  "Allow Multiple Answers",
  "Test Value",
  "Default Value",
  "Suggest Value",
  "Key",
] as const;

export const ENUM_HEADERS = ["Enum Name", "Loaded to IPFS", "Value"] as const;
export const HEADER_ROW = 4;

const yesNo = (value: boolean | undefined) => (value ? "Yes" : "No");

export function buildResultSchemaWorkbook(): ExcelJS.Workbook {
  if (RESULT_SCHEMA_NAME.length > 30) throw new Error("Excel sheet names are limited to 30 characters");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "hydro-dmrv guardian bridge";

  const sheet = workbook.addWorksheet(RESULT_SCHEMA_NAME);
  sheet.getCell("A1").value = RESULT_SCHEMA_NAME;
  sheet.mergeCells(1, 1, 1, FIELD_HEADERS.length);
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = "Schema Description";
  sheet.getCell("B2").value = RESULT_SCHEMA_DESCRIPTION;
  sheet.getCell("A3").value = "Schema Type";
  sheet.getCell("B3").value = "Verifiable Credentials";

  const header = sheet.getRow(HEADER_ROW);
  FIELD_HEADERS.forEach((title, i) => (header.getCell(i + 1).value = title));
  header.font = { bold: true };

  RESULT_FIELDS.forEach((field, index) => {
    const row = sheet.getRow(HEADER_ROW + 1 + index);
    row.values = [
      yesNo(field.required),
      field.type,
      field.enumName ?? "",
      "",
      field.description,
      yesNo(field.isArray),
      String(field.example),
      "",
      "",
      field.key,
    ];
  });
  sheet.columns.forEach((column, i) => (column.width = [14, 12, 22, 10, 60, 12, 40, 12, 12, 18][i]));

  const enums = workbook.addWorksheet("Enums");
  enums.getRow(1).values = [...ENUM_HEADERS];
  enums.getRow(1).font = { bold: true };
  let row = 2;
  for (const field of RESULT_FIELDS) {
    if (field.type !== "Enum" || !field.enum) continue;
    field.enum.forEach((value, i) => {
      enums.getRow(row++).values = i === 0 ? [field.enumName!, "No", value] : ["", "", value];
    });
  }
  enums.columns.forEach((column, i) => (column.width = [24, 16, 20][i]));
  return workbook;
}
