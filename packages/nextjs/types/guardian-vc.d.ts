// The @digitalbazaar packages Guardian 3.7.0 pins ship no TypeScript types. Only the surface we call is declared.
declare module "@digitalbazaar/vc" {
  export type DocumentLoader = (
    url: string,
  ) => Promise<{ documentUrl: string; document: unknown; contextUrl?: string | null }>;
  export type VerificationResult = {
    verified: boolean;
    error?: { message?: string; errors?: { message?: string }[] };
    results?: { verified: boolean; error?: { message?: string } }[];
    presentationResult?: VerificationResult;
    credentialResults?: VerificationResult[];
  };
  export function issue(options: {
    credential: object;
    suite: unknown;
    documentLoader: DocumentLoader;
    now?: Date;
  }): Promise<any>;
  export function verifyCredential(options: {
    credential: object;
    suite: unknown | unknown[];
    documentLoader: DocumentLoader;
    checkStatus?: unknown;
  }): Promise<VerificationResult>;
  export function verify(options: {
    presentation: object;
    challenge?: string;
    unsignedPresentation?: boolean;
    suite: unknown | unknown[];
    documentLoader: DocumentLoader;
  }): Promise<VerificationResult>;
  export function createPresentation(options: {
    verifiableCredential?: object | object[];
    id?: string;
    holder?: string;
  }): any;
  export function signPresentation(options: {
    presentation: object;
    suite: unknown;
    documentLoader: DocumentLoader;
    challenge: string;
    domain?: string;
  }): Promise<any>;
}
declare module "@digitalbazaar/ed25519-signature-2018" {
  export class Ed25519Signature2018 {
    static CONTEXT_URL: string;
    static CONTEXT: object;
    constructor(options?: { key?: unknown; verificationMethod?: string; date?: Date | string });
  }
}
declare module "@digitalbazaar/ed25519-verification-key-2018" {
  export class Ed25519VerificationKey2018 {
    static from(options: object): Promise<Ed25519VerificationKey2018>;
    id: string;
    controller: string;
  }
}
declare module "@digitalbazaar/credentials-context" {
  export const contexts: Map<string, object>;
  export const CONTEXT_URL: string;
}
declare module "@digitalbazaar/security-context" {
  const securityContext: { contexts: Map<string, object> };
  export default securityContext;
}
declare module "did-context" {
  const didContext: { contexts: Map<string, object> };
  export default didContext;
}
