import { documentHash, documentIsIntact, documentMessage, type Document } from "./envelope";
import { demoDocuments } from "./demo";
import { prepareDocumentSchema, publishDocumentSchema } from "./schema";
import { deriveTrustChain } from "./workflow";
import { ApiError } from "../server/errors";
import type { z } from "zod";

const published: Document[] = [];

const DEMO_CREDITS: Record<string, number> = {
  "HYDRO-DEMO-01": 4791,
  "HYDRO-DEMO-02": 72389,
};

export async function listDocuments(subjectId?: string) {
  const ids = subjectId ? [subjectId] : Object.keys(DEMO_CREDITS);
  const demos = (
    await Promise.all(ids.filter(id => id in DEMO_CREDITS).map(id => demoDocuments(id, DEMO_CREDITS[id])))
  ).flat();
  const extra = subjectId ? published.filter(doc => doc.subjectId === subjectId) : published;
  return [...demos, ...extra];
}

export function prepareDocument(input: z.infer<typeof prepareDocumentSchema>) {
  const doc: Document = {
    ...input,
    previousHash: input.previousHash as Document["previousHash"],
    issuer: input.issuer as Document["issuer"],
  };
  const hash = documentHash(doc);
  return { document: { ...doc, hash }, message: documentMessage(hash) };
}

export async function checkSignedDocument(input: z.infer<typeof publishDocumentSchema>) {
  const doc = input as Document;
  if (!(await documentIsIntact(doc))) throw new ApiError("Document hash or signature does not match the signer", 400);
  return { intact: true, stored: false, subjectId: doc.subjectId, hash: doc.hash, type: doc.type };
}

export async function publishDocument(input: z.infer<typeof publishDocumentSchema>) {
  const checked = await checkSignedDocument(input);
  published.push(input as Document);
  return { ...checked, stored: true };
}

export async function trustChainFor(subjectId: string) {
  const docs = await listDocuments(subjectId);
  const credits = DEMO_CREDITS[subjectId] ?? null;
  return deriveTrustChain(subjectId, docs, credits);
}

/** What an operator should seal after a successful hydro attestation. Does not write to chain. */
export function monitoringDocumentDraft(
  subjectId: string,
  summary: string,
  previousHash: `0x${string}` | null,
  issuer: `0x${string}`,
) {
  return prepareDocument({
    type: "monitoring-report",
    subjectId,
    role: "proponent",
    sections: {
      "5.1": summary,
      "5.5": "Seal this hash with the proponent wallet. The hydro mint already happened; this document only records it.",
    },
    previousHash,
    issuer,
  });
}
