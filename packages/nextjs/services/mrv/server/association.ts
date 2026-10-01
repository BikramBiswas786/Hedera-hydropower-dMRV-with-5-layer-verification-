import { MIRROR_NODE_URL } from "../network";
import { fetchUpstream, isUpstreamTimeout } from "../upstream";
import { type Address, getAddress } from "viem";

/**
 * A purchase swaps the buyer's HBAR into the pool's USD token and pays it straight to the seller. Hedera refuses a
 * token transfer to an account that has not associated the token (and has no free auto-association slot), so the
 * swap, and with it the whole purchase, reverts. The builder checks first so a buyer never signs a doomed
 * transaction.
 */
export type SellerReadiness =
  | { status: "ready"; reason: "associated" | "auto-association" }
  | { status: "not-associated"; tokenId: string }
  | { status: "unknown"; reason: string };

/** Hedera entity id of a long-zero EVM address (HTS tokens have one), or null for any other address. */
export function longZeroToEntityId(address: Address): string | null {
  const hex = getAddress(address).slice(2);
  return /^0{24}/i.test(hex) ? `0.0.${BigInt(`0x${hex}`)}` : null;
}

type MirrorAccount = { max_automatic_token_associations?: number };
type MirrorTokenRelationships = { tokens?: { token_id: string }[] };

/** Pure decision from the two mirror-node answers. */
export function sellerReadiness(
  tokenId: string,
  account: MirrorAccount,
  relationships: MirrorTokenRelationships,
): SellerReadiness {
  if (relationships.tokens?.some(t => t.token_id === tokenId)) return { status: "ready", reason: "associated" };
  const slots = account.max_automatic_token_associations ?? 0;
  // -1 is unlimited; a positive count may still be used up, which the mirror node does not report cheaply.
  if (slots === -1 || slots > 0) return { status: "ready", reason: "auto-association" };
  return { status: "not-associated", tokenId };
}

export async function readSellerReadiness(
  seller: Address,
  usdToken: Address,
  fetchImpl: typeof fetch = fetch,
): Promise<SellerReadiness> {
  const tokenId = longZeroToEntityId(usdToken);
  if (!tokenId) return { status: "unknown", reason: `${usdToken} is not an HTS token address` };
  try {
    const get = async <T>(path: string): Promise<T> => {
      let response: Response;
      try {
        response = await fetchUpstream(fetchImpl, `${MIRROR_NODE_URL}${path}`);
      } catch (error) {
        if (isUpstreamTimeout(error)) throw new Error("Mirror node timed out");
        throw error;
      }
      if (!response.ok) throw new Error(`mirror node returned ${response.status}`);
      return (await response.json()) as T;
    };
    const [account, relationships] = await Promise.all([
      get<MirrorAccount>(`/api/v1/accounts/${seller}`),
      get<MirrorTokenRelationships>(`/api/v1/accounts/${seller}/tokens?token.id=${tokenId}`),
    ]);
    return sellerReadiness(tokenId, account, relationships);
  } catch (error) {
    return { status: "unknown", reason: (error as Error).message };
  }
}
