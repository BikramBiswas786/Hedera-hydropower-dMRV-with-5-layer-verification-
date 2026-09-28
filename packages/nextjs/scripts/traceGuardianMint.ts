/**
 * `yarn guardian:trace <ref> [--expect backed] [--require record,order]`: the buyer's check on a Guardian-minted token, from the command line.
 * ref is nft:<tokenId>:<serial>, ft:<tokenId>:<holder account> or a mint transaction id. Reads the public mirror node
 * (GUARDIAN_MIRROR_NODE_URL, default testnet) and IPFS (GUARDIAN_IPFS_GATEWAY, raw blocks hashed against the CID).
 * The Guardian trace workflow runs it on a real testnet mint.
 */
import { traceGuardianMint } from "../services/mrv/guardian/trace";
import { readGuardianSources } from "../services/mrv/server/guardianBridge";

const MARK = { true: "✓", false: "✗", null: "?" } as const;

async function main() {
  const args = process.argv.slice(2);
  const ref = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const expect = option("--expect");
  const require = option("--require")?.split(",") ?? [];
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
  // --require a,b: those checks must pass and none may fail (a source that cannot be read is allowed).
  const passed = new Set(trace.checks.filter(c => c.ok === true).map(c => c.id));
  if (require.some(id => !passed.has(id)) || trace.checks.some(c => c.ok === false)) process.exit(1);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
