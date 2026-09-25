import { documentHash, documentIsIntact, type Document } from "./envelope";

export type ChainStatus = "empty" | "described" | "validated" | "registered" | "monitoring" | "issued" | "broken";

export type TrustChain = {
  subjectId: string;
  status: ChainStatus;
  documents: Array<Document & { intact: boolean }>;
  creditsKg: number | null;
};

const ORDER = [
  "project-description",
  "validation-report",
  "registry-decision",
  "monitoring-report",
  "verification-report",
] as const;

const STATUS_AT: ChainStatus[] = ["described", "validated", "registered", "monitoring", "issued"];

export async function deriveTrustChain(
  subjectId: string,
  documents: Document[],
  creditsKg: number | null = null,
): Promise<TrustChain> {
  const mine = documents.filter(doc => doc.subjectId === subjectId);
  const annotated = [];
  let broken = false;
  let previous: `0x${string}` | null = null;
  for (const type of ORDER) {
    const doc = mine.find(item => item.type === type);
    if (!doc) break;
    const intact = await documentIsIntact(doc);
    const linkOk = (doc.previousHash ?? null) === previous && doc.hash === documentHash(doc);
    if (!intact || !linkOk) broken = true;
    annotated.push({ ...doc, intact: intact && linkOk });
    previous = doc.hash ?? null;
    if (broken) break;
  }
  const reached = annotated.filter(doc => doc.intact).length;
  const status: ChainStatus = broken ? "broken" : reached === 0 ? "empty" : STATUS_AT[reached - 1];
  return { subjectId, status, documents: annotated, creditsKg: status === "issued" ? creditsKg : null };
}
