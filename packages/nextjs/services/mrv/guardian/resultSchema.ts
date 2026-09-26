/**
 * The "DMRV Cross-Check Result" Guardian schema (spec §5.2.3). One definition drives the JSON reference document,
 * the Guardian Excel import workbook (scripts/guardian-schema.ts) and the subject check before we sign.
 *
 * Guardian rules applied (common/src/xlsx at tag 3.7.0, digest §2.2): name ≤ 30 characters, keys without dots,
 * plain field types only (String, Number, Integer, Enum) so the sheet imports on 3.7.0 and 3.7.1.
 */

export const RESULT_SCHEMA_NAME = "DMRV Cross-Check Result";
export const RESULT_SCHEMA_DESCRIPTION =
  "Signed by the Hydro dMRV bridge DID. Our integer recomputation of a Guardian VMR0017 Monitoring Report, the " +
  "report's own BE/PE/LE/ER and the difference. The registry is the issuer of record; this document never mints.";
export const BRIDGE_VERSION = "guardian-bridge@1";

export const DECISIONS = ["MATCH", "MISMATCH", "NOT_COMPARABLE"] as const;
export type Decision = (typeof DECISIONS)[number];
export const ISSUERS_OF_RECORD = ["DMRV"] as const;

type FieldType = "String" | "Number" | "Integer" | "Enum";

export type ResultField = {
  key: string;
  type: FieldType;
  required: boolean;
  isArray?: boolean;
  description: string;
  /** Enum values and the enum's name in the workbook's shared "Enums" tab. */
  enumName?: string;
  enum?: readonly string[];
  /** Test Value column. */
  example: string | number;
};

export const RESULT_FIELDS: ResultField[] = [
  {
    key: "bridgeVersion",
    type: "String",
    required: true,
    description: "Bridge protocol version",
    example: BRIDGE_VERSION,
  },
  {
    key: "decision",
    type: "Enum",
    required: true,
    description: "Cross-check result",
    enumName: "DMRV Decision",
    enum: DECISIONS,
    example: "MATCH",
  },
  {
    key: "methodologyId",
    type: "String",
    required: true,
    description: "Methodology module id",
    example: "hydro/acm0002+vmr0017",
  },
  { key: "moduleVersion", type: "Integer", required: true, description: "On-chain module version()", example: 1 },
  {
    key: "sourceVcId",
    type: "String",
    required: true,
    description: "id of the Monitoring Report VC received",
    example: "urn:uuid:00000000-0000-4000-8000-000000000000",
  },
  {
    key: "sourceVcHash",
    type: "String",
    required: true,
    description: "keccak256 of the canonical JSON of the received VC",
    example: "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
  {
    key: "oursBEt",
    type: "Number",
    required: true,
    description: "Our baseline emissions BE (t CO2e, 6 dp)",
    example: 1,
  },
  {
    key: "oursPEt",
    type: "Number",
    required: true,
    description: "Our project emissions PE (t CO2e, 6 dp)",
    example: 0,
  },
  { key: "oursLEt", type: "Number", required: true, description: "Our leakage LE (t CO2e, 6 dp)", example: 0 },
  {
    key: "oursERt",
    type: "Number",
    required: true,
    description: "Our emission reductions ER, floored at 0 (t CO2e, 6 dp)",
    example: 1,
  },
  {
    key: "theirsBEt",
    type: "Number",
    required: true,
    description: "Report BE as received (field24, t CO2e)",
    example: 1,
  },
  {
    key: "theirsPEt",
    type: "Number",
    required: true,
    description: "Report PE as received (field25, t CO2e)",
    example: 0,
  },
  {
    key: "theirsLEt",
    type: "Number",
    required: true,
    description: "Report LE as received (field26, t CO2e)",
    example: 0,
  },
  {
    key: "theirsERt",
    type: "Number",
    required: true,
    description: "Report ER as received (field27, t CO2e)",
    example: 1,
  },
  { key: "deltaERg", type: "Integer", required: true, description: "Our ER minus the report ER, in grams", example: 0 },
  {
    key: "notes",
    type: "String",
    required: false,
    isArray: true,
    description: "Reasons, tolerances and caveats",
    example: "none",
  },
  {
    key: "registryAddress",
    type: "String",
    required: false,
    description: "Our registry, if the project is registered there",
    example: "0x0000000000000000000000000000000000000000",
  },
  {
    key: "projectId",
    type: "String",
    required: false,
    description: "bytes32 project id in our registry",
    example: "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
  {
    key: "attestationIds",
    type: "Integer",
    required: false,
    isArray: true,
    description: "On-chain attestations covering the period",
    example: 0,
  },
  {
    key: "issuerOfRecord",
    type: "Enum",
    required: true,
    description: "Issuer of record",
    enumName: "DMRV Issuer Of Record",
    enum: ISSUERS_OF_RECORD,
    example: "DMRV",
  },
];

/** Properties Guardian adds to every VC schema (system fields), plus JSON-LD plumbing. */
const SYSTEM_PROPERTIES = ["@context", "type", "id", "policyId", "ref", "guardianVersion"] as const;

const TEXT_ID = "https://www.schema.org/text";

function jsonType(field: ResultField) {
  const base =
    field.type === "Number"
      ? { type: "number" }
      : field.type === "Integer"
        ? { type: "integer" }
        : field.type === "Enum"
          ? { type: "string", enum: [...(field.enum ?? [])] }
          : { type: "string" };
  return field.isArray ? { type: "array", items: base } : base;
}

/**
 * Guardian's stored schema document (the `document` of a schema export: JSON Schema with `$comment` linked-data
 * embeddings). `uuid` is ours for the reference file; Guardian assigns its own when the workbook is imported.
 */
export function buildResultSchemaDocument(uuid: string, version = "") {
  const ref = version ? `${uuid}&${version}` : uuid;
  const properties: Record<string, unknown> = {
    "@context": { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }], readOnly: true },
    type: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }], readOnly: true },
    id: { type: "string", readOnly: true },
    policyId: system("policyId", "Policy Id"),
    ref: system("ref", "Relationships"),
    guardianVersion: system("guardianVersion", "Guardian Version"),
  };
  RESULT_FIELDS.forEach((field, orderPosition) => {
    properties[field.key] = {
      title: field.key,
      description: field.description,
      readOnly: false,
      ...jsonType(field),
      $comment: JSON.stringify({ term: field.key, "@id": TEXT_ID, orderPosition }),
    };
  });
  return {
    $id: `#${ref}`,
    $comment: JSON.stringify({ "@id": `schema:${uuid}#${uuid}`, term: uuid }),
    title: RESULT_SCHEMA_NAME,
    description: RESULT_SCHEMA_DESCRIPTION,
    type: "object",
    properties,
    required: ["@context", "type", ...RESULT_FIELDS.filter(f => f.required).map(f => f.key)],
    additionalProperties: false,
    $defs: {},
  };
}

function system(term: string, title: string) {
  return {
    title,
    description: title,
    readOnly: true,
    type: "string",
    $comment: JSON.stringify({ term, "@id": TEXT_ID }),
  };
}

/**
 * JSON-LD context for the schema, built the way Guardian builds it (common/src/helpers/jsonld-schema, vendored
 * from @transmute/jsonld-schema, Apache-2.0). Guardian also forces `@vocab` to the traceability term when it loads
 * a context (LocalSchemaContextLoader), so we do the same.
 */
export function buildResultSchemaContext(uuid: string) {
  const document = buildResultSchemaDocument(uuid);
  const terms: Record<string, { "@id": string }> = {};
  for (const [key, value] of Object.entries(document.properties)) {
    const comment = (value as { $comment?: string }).$comment;
    if (comment) terms[(JSON.parse(comment) as { term: string }).term ?? key] = { "@id": TEXT_ID };
  }
  return {
    "@context": {
      "@version": 1.1,
      "@vocab": "https://w3id.org/traceability/#undefinedTerm",
      id: "@id",
      type: "@type",
      [uuid]: { "@id": `schema:${uuid}#${uuid}`, "@context": terms },
    },
  };
}

export type ResultSubjectFields = {
  bridgeVersion: string;
  decision: Decision;
  methodologyId: string;
  moduleVersion: number;
  sourceVcId: string;
  sourceVcHash: string;
  oursBEt: number;
  oursPEt: number;
  oursLEt: number;
  oursERt: number;
  theirsBEt: number;
  theirsPEt: number;
  theirsLEt: number;
  theirsERt: number;
  deltaERg: number;
  notes?: string[];
  registryAddress?: string;
  projectId?: string;
  attestationIds?: number[];
  issuerOfRecord: "DMRV";
};

/**
 * The same checks Guardian's `verifySchema` (ajv, additionalProperties: false) would make on our subject, so a
 * malformed result fails here with a readable message instead of as "Received data is not VC" in the policy.
 */
export function checkResultSubject(subject: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const known = new Map(RESULT_FIELDS.map(f => [f.key, f]));
  for (const key of Object.keys(subject)) {
    if (!known.has(key) && !(SYSTEM_PROPERTIES as readonly string[]).includes(key))
      errors.push(`unexpected property ${key}`);
  }
  for (const field of RESULT_FIELDS) {
    const value = subject[field.key];
    if (value === undefined) {
      if (field.required) errors.push(`missing ${field.key}`);
      continue;
    }
    const values = field.isArray ? (Array.isArray(value) ? value : [Symbol("not an array")]) : [value];
    for (const item of values) {
      const ok =
        field.type === "Number"
          ? typeof item === "number" && Number.isFinite(item)
          : field.type === "Integer"
            ? typeof item === "number" && Number.isSafeInteger(item)
            : field.type === "Enum"
              ? typeof item === "string" && (field.enum ?? []).includes(item)
              : typeof item === "string";
      if (!ok) errors.push(`${field.key} is not a valid ${field.isArray ? `${field.type}[]` : field.type}`);
    }
  }
  return errors;
}
