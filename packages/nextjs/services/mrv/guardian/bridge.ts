import {
  HYDRO_METHODOLOGY_ID,
  HYDRO_MODULE_VERSION,
  MappingError,
  crossCheckMonitoringReport,
  tonnes,
} from "./crossCheck";
import { type BridgeKeyPair, buildDidDocument } from "./did";
import { localDidResolver } from "./hedera";
import { BRIDGE_VERSION, type ResultSubjectFields, buildResultSchemaContext, checkResultSubject } from "./resultSchema";
import { CREDENTIALS_V1, buildDocumentLoader, issueCredential } from "./vc";
import type { PrivateKey } from "@hiero-ledger/sdk";
import { keccak256, stringToBytes } from "viem";

/**
 * The cross-check Guardian's httpRequestBlock calls (spec §5.2–5.3): take the Monitoring Report VC the block posts,
 * recompute it with our engine, and answer with a VC of the "DMRV Cross-Check Result" schema signed by the bridge
 * DID. Guardian refuses anything else with "Received data is not VC".
 */

export type ResultSchemaRef = {
  /** credentialSubject.type: the schema iri without "#", "<uuid>&<version>" once published, "<uuid>" in a draft. */
  type: string;
  /** credentialSubject["@context"][0]: the schema's contextURL, "ipfs://…" once published, "schema:<uuid>" in a draft. */
  contextUrl: string;
  /** The schema's JSON-LD context as Guardian stores it; built from our definition when omitted. */
  context?: object;
};

export type BridgeSigner = { did: string; key: PrivateKey; keyPair: BridgeKeyPair };

export class NotAVcError extends Error {}

/** Sorted-key JSON without whitespace, so the hash does not depend on how Guardian orders properties. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sourceVcHash = (vc: unknown) => keccak256(stringToBytes(canonicalJson(vc)));

/** The httpRequestBlock posts the input document, or an array of documents when the block receives several. */
export function extractSourceVc(body: unknown): { vc: Record<string, any>; subject: Record<string, unknown> } {
  const vc = Array.isArray(body) ? (body.length === 1 ? body[0] : null) : body;
  if (!vc || typeof vc !== "object") throw new NotAVcError("Body must be one Guardian VC document (JSON object)");
  const record = vc as Record<string, any>;
  const context = record["@context"];
  const types = Array.isArray(record.type) ? record.type : [record.type];
  if (
    !(Array.isArray(context) ? context : [context]).includes(CREDENTIALS_V1) ||
    !types.includes("VerifiableCredential")
  ) {
    throw new NotAVcError("Body is not a W3C VC (missing credentials/v1 context or VerifiableCredential type)");
  }
  const subjects = record.credentialSubject;
  const subject = Array.isArray(subjects) ? subjects[0] : subjects;
  if (!subject || typeof subject !== "object") throw new NotAVcError("VC has no credentialSubject");
  return { vc: record, subject };
}

function schemaUuid(ref: ResultSchemaRef): string {
  const uuid = ref.type.split("&")[0].replace(/^#/, "");
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error(`Result schema type is not "<uuid>[&version]": ${ref.type}`);
  return uuid;
}

export type CrossCheckInput = {
  body: unknown;
  policyId?: string | null;
  schema: ResultSchemaRef;
  signer: BridgeSigner;
  /** Injected for deterministic tests; defaults to crypto.randomUUID and the current time. */
  uuid?: () => string;
  now?: Date;
  registry?: { registryAddress?: string; projectId?: string; attestationIds?: number[] };
};

export async function runCrossCheck(input: CrossCheckInput) {
  const { vc, subject } = extractSourceVc(input.body);
  const hash = sourceVcHash(vc);
  const outcome = crossCheckMonitoringReport(subject);
  const uuid = input.uuid ?? (() => crypto.randomUUID());
  const now = input.now ?? new Date();
  const policyId = input.policyId || (typeof subject.policyId === "string" ? subject.policyId : "");
  const sourceVcId = typeof vc.id === "string" ? vc.id : "";
  if (!sourceVcId) throw new MappingError("The received VC has no id");

  const fields: ResultSubjectFields = {
    bridgeVersion: BRIDGE_VERSION,
    decision: outcome.decision,
    methodologyId: HYDRO_METHODOLOGY_ID,
    moduleVersion: HYDRO_MODULE_VERSION,
    sourceVcId,
    sourceVcHash: hash,
    oursBEt: tonnes(outcome.oursG.be),
    oursPEt: tonnes(outcome.oursG.pe),
    oursLEt: tonnes(outcome.oursG.le),
    oursERt: tonnes(outcome.oursG.er),
    theirsBEt: outcome.theirsT.be,
    theirsPEt: outcome.theirsT.pe,
    theirsLEt: outcome.theirsT.le,
    theirsERt: outcome.theirsT.er,
    deltaERg: Number(outcome.deltaERg),
    ...(outcome.notes.length ? { notes: outcome.notes } : {}),
    ...(input.registry?.registryAddress ? { registryAddress: input.registry.registryAddress } : {}),
    ...(input.registry?.projectId ? { projectId: input.registry.projectId } : {}),
    ...(input.registry?.attestationIds?.length ? { attestationIds: input.registry.attestationIds } : {}),
    issuerOfRecord: "DMRV",
  };

  // Subject layout of Guardian's VcSubject.toJsonTree(): fields, then @context, id, type.
  const credentialSubject = {
    ...fields,
    policyId,
    ref: sourceVcId,
    "@context": [input.schema.contextUrl],
    id: `urn:uuid:${uuid()}`,
    type: input.schema.type,
  };
  const problems = checkResultSubject(credentialSubject);
  if (problems.length) throw new Error(`Result subject does not match the schema: ${problems.join("; ")}`);

  const credential = {
    id: `urn:uuid:${uuid()}`,
    type: ["VerifiableCredential"],
    issuer: input.signer.did,
    issuanceDate: now.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    "@context": [CREDENTIALS_V1],
    credentialSubject: [credentialSubject],
  };

  const context = input.schema.context ?? buildResultSchemaContext(schemaUuid(input.schema));
  const documentLoader = buildDocumentLoader(
    async iri => (iri === input.schema.contextUrl ? { documentUrl: iri, document: context } : null),
    localDidResolver({ [input.signer.did]: buildDidDocument(input.signer.did, input.signer.key) }),
  );
  const signed = await issueCredential(credential, input.signer.keyPair, documentLoader, now);
  return { vc: signed, decision: outcome.decision, sourceVcHash: hash };
}
