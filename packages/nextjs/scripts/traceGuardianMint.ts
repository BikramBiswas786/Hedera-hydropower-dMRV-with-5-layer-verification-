/**
 * `yarn guardian:trace <ref> [--expect backed]`: the buyer's check on a Guardian-minted token, from the command line.
 * ref is nft:<tokenId>:<serial>, ft:<tokenId>:<holder account> or a mint transaction id. Reads the public mirror node
 * (GUARDIAN_MIRROR_NODE_URL, default testnet) and IPFS (GUARDIAN_IPFS_GATEWAY, raw blocks hashed against the CID).
 * The Guardian trace workflow runs it on a real testnet mint.
 */
import { traceGuardianMint } from "../services/mrv/guardian/trace";
import { readGuardianSources } from "../services/mrv/server/guardianBridge";

const MARK = { true: "✓", false: "✗", null: "?" } as const;

async function main() {
  const args = process.argv.slice(2);
  const ref = args.find(a => !a.startsWith("--"));
  const expect = args.includes("--expect") ? args[args.indexOf("--expect") + 1] : null;
  if (!ref)
    throw new Error("usage: yarn guardian:trace <nft:token:serial | ft:token:account | tx id> [--expect backed]");

  const trace = await traceGuardianMint(readGuardianSources(), ref);
  console.log(`${trace.token.name} (${trace.token.id}), treasury ${trace.token.treasury}`);
  console.log(
    `record ${trace.record.timestamp} on ${trace.record.topicId} #${trace.record.sequence}, cid ${trace.record.cid}`,
  );
  if (trace.mintVc) console.log(`MintToken VC: ${trace.mintVc.amount} of ${trace.mintVc.tokenId}`);
  for (const check of trace.checks)
    console.log(`  ${MARK[String(check.ok) as keyof typeof MARK]} ${check.id}: ${check.detail}`);
  for (const source of trace.sources) {
    console.log(
      `  ${"  ".repeat(source.depth)}↳ ${source.type ?? "message"} ${source.status ?? ""} (paid by ${source.payer})`,
    );
  }
  console.log(`verdict: ${trace.verdict}`);
  if (expect && trace.verdict !== expect) process.exit(1);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
