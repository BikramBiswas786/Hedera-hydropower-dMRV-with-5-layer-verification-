import type { BridgeKeyPair } from "./did";
import { ED25519_2018 } from "./did";
import { contexts as credentialsContexts } from "@digitalbazaar/credentials-context";
import { Ed25519Signature2018 } from "@digitalbazaar/ed25519-signature-2018";
import { Ed25519VerificationKey2018 } from "@digitalbazaar/ed25519-verification-key-2018";
import securityContexts from "@digitalbazaar/security-context";
import * as vcLib from "@digitalbazaar/vc";
import didContexts from "did-context";

/**
 * Signing and verifying W3C VCs with the stack Guardian 3.7.0 pins in common/package.json:
 * @digitalbazaar/vc 7.3.0, ed25519-signature-2018 4.2.0, ed25519-verification-key-2018 4.0.0,
 * credentials-context 3.2.0, security-context 1.0.1, did-context 3.1.1.
 *
 * `verifyGuardianCredential` is a line-for-line port of VCJS.verify and VCJS.ed25519VerificationDocumentLoader
 * (common/src/hedera-modules/vcjs/vcjs.ts at tag 3.7.0, Apache-2.0), and `staticDocumentLoader` of
 * DefaultDocumentLoader. What Guardian does to accept our response, we do in tests and in the evidence verifier.
 * Never hand-roll JWS or canonicalisation: Guardian's verifier depends on this suite's exact behaviour.
 */

export type DocumentLoader = vcLib.DocumentLoader;
export type LoadedDocument = { documentUrl: string; document: any };
export type Resolver = (iri: string) => Promise<LoadedDocument | null>;

export const CREDENTIALS_V1 = "https://www.w3.org/2018/credentials/v1";

/** Guardian's DefaultDocumentLoader: did, credentials and security contexts, all offline. */
export function staticDocument(iri: string): LoadedDocument | null {
  for (const map of [didContexts.contexts, credentialsContexts, securityContexts.contexts]) {
    const document = map.get(iri);
    if (document) return { documentUrl: iri, document };
  }
  return null;
}

/** Chains resolvers like Guardian's DocumentLoader.build: first hit wins, otherwise "IRI not found". */
export function buildDocumentLoader(...resolvers: Resolver[]): DocumentLoader {
  return async (iri: string) => {
    const fixed = staticDocument(iri);
    if (fixed) return { ...fixed, contextUrl: null };
    for (const resolve of resolvers) {
      const hit = await resolve(iri);
      if (hit) return { ...hit, contextUrl: null };
    }
    throw new Error(`IRI not found: ${iri}`);
  };
}

/** Port of VCJS.ed25519VerificationDocumentLoader (vcjs.ts:252–284 at 3.7.0). */
export function ed25519VerificationDocumentLoader(documentLoader: DocumentLoader): DocumentLoader {
  const contextUrl = Ed25519Signature2018.CONTEXT_URL;
  const context = Ed25519Signature2018.CONTEXT;
  return async (iri: string) => {
    if (iri === contextUrl) return { documentUrl: iri, document: context };
    const result = await documentLoader(iri);
    const document = result?.document as any;
    if (document && Array.isArray(document.verificationMethod)) {
      if (iri.indexOf("#") !== -1) {
        const method = document.verificationMethod.find((item: any) => item?.id === iri);
        if (method && method.type === ED25519_2018) {
          return { documentUrl: iri, document: { "@context": contextUrl, ...method } };
        }
      } else if (Array.isArray(document.assertionMethod)) {
        const assertionMethod = document.assertionMethod.map((reference: any) =>
          typeof reference === "string" && reference.startsWith("#") ? document.id + reference : reference,
        );
        return { documentUrl: iri, document: { ...document, assertionMethod } };
      }
    }
    return result;
  };
}

function firstError(result: vcLib.VerificationResult): string {
  for (const element of result.results ?? []) {
    if (!element.verified && element.error?.message) return element.error.message;
  }
  return result.error?.errors?.[0]?.message ?? result.error?.message ?? "Verification error";
}

/** Port of VCJS.verify for Ed25519Signature2018 (vcjs.ts:203–234 at 3.7.0). Throws with Guardian's message. */
export async function verifyGuardianCredential(json: any, documentLoader: DocumentLoader): Promise<true> {
  const proof = Array.isArray(json?.proof) ? json.proof[0] : json?.proof;
  if (!proof || !proof.type) throw new Error("Verification error: document is missing a proof");
  if (proof.type !== "Ed25519Signature2018") throw new Error(`Unsupported proof type ${proof.type}`);
  const result = await vcLib.verifyCredential({
    credential: json,
    suite: [new Ed25519Signature2018()],
    documentLoader: ed25519VerificationDocumentLoader(documentLoader),
  });
  if (result.verified) return true;
  throw new Error(firstError(result));
}

/**
 * A Guardian VP: proof by the policy's Standard Registry with `proofPurpose: authentication` and the fixed
 * challenge "123" Guardian passes to signPresentation (VCJS.issuePresentation). Each embedded VC is verified too.
 */
export async function verifyGuardianPresentation(json: any, documentLoader: DocumentLoader): Promise<true> {
  const result = await vcLib.verify({
    presentation: json,
    challenge: "123",
    suite: [new Ed25519Signature2018()],
    documentLoader: ed25519VerificationDocumentLoader(documentLoader),
  });
  if (result.verified) return true;
  const failed = result.presentationResult && !result.presentationResult.verified ? result.presentationResult : null;
  const vcFailed = result.credentialResults?.find(r => !r.verified);
  throw new Error(firstError(failed ?? vcFailed ?? result));
}

/** Issues a VC the way Guardian's VCJS.issue does for Ed25519 (vcLib.issue with the key's suite). */
export async function issueCredential(
  credential: object,
  keyPair: BridgeKeyPair,
  documentLoader: DocumentLoader,
  now?: Date,
) {
  const key = await Ed25519VerificationKey2018.from(keyPair);
  const suite = new Ed25519Signature2018({ key, ...(now ? { date: now } : {}) });
  return vcLib.issue({ credential, suite, documentLoader });
}
