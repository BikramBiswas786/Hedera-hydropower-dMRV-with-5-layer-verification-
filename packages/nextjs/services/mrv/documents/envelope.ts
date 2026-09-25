import { createHash } from "crypto";
import { recoverMessageAddress, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

/** VCS-shaped documents. This is not a Verra schema and it does not mint credits. */
export const DOCUMENT_TYPES = [
  "project-description",
  "validation-report",
  "registry-decision",
  "monitoring-report",
  "verification-report",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type DocumentRole = "proponent" | "auditor" | "registry" | "verifier";

export const ROLE_FOR_TYPE: Record<DocumentType, DocumentRole> = {
  "project-description": "proponent",
  "validation-report": "auditor",
  "registry-decision": "registry",
  "monitoring-report": "proponent",
  "verification-report": "verifier",
};

export type Document = {
  type: DocumentType;
  subjectId: string;
  role: DocumentRole;
  /** VCS section ids (PD 1.1, 3.5, MR 5.1, …). Keys are section numbers, values are plain text. */
  sections: Record<string, string>;
  previousHash: Hex | null;
  issuer: Hex;
  hash?: Hex;
  signature?: Hex;
};

export function documentMessage(hash: Hex) {
  return `hydro-dmrv/document ${hash}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function documentHash(doc: Document): Hex {
  const body = {
    type: doc.type,
    subjectId: doc.subjectId,
    role: doc.role,
    sections: doc.sections,
    previousHash: doc.previousHash,
    issuer: doc.issuer.toLowerCase(),
  };
  return `0x${createHash("sha256").update(canonical(body)).digest("hex")}`;
}

export async function sealDocument(doc: Document, account: PrivateKeyAccount): Promise<Document> {
  const hash = documentHash(doc);
  const signature = await account.signMessage({ message: documentMessage(hash) });
  return { ...doc, issuer: account.address, hash, signature };
}

export async function documentIsIntact(doc: Document): Promise<boolean> {
  if (!doc.hash || !doc.signature) return false;
  if (documentHash(doc) !== doc.hash) return false;
  if (doc.role !== ROLE_FOR_TYPE[doc.type]) return false;
  try {
    const recovered = await recoverMessageAddress({ message: documentMessage(doc.hash), signature: doc.signature });
    return recovered.toLowerCase() === doc.issuer.toLowerCase();
  } catch {
    return false;
  }
}
