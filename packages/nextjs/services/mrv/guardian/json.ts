/** A parsed Guardian document or HCS message: nothing in it is trusted until each field is checked. */
export type JsonObject = Record<string, unknown>;

/** `value` if it is a JSON object, otherwise an empty one, so a missing field reads as `undefined`. */
export const asObject = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};

/** A VC's credentialSubject, which JSON-LD allows as one object or a list. */
export function subjectsOf(vc: unknown): JsonObject[] {
  const s = asObject(vc).credentialSubject;
  return (Array.isArray(s) ? s : s ? [s] : []).map(asObject);
}

/** JSON.parse that answers an empty object for text that is not a JSON object. */
export function parseObject(text: string): JsonObject {
  try {
    return asObject(JSON.parse(text));
  } catch {
    return {};
  }
}
