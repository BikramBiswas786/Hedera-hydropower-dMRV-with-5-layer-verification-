/**
 * Creates the 2-of-3 threshold admin account for DmrvRegistry and CreditMarket (spec D-6: no single key can
 * approve modules, grant VERIFIER_ROLE, move the pool guard or sweep HBAR).
 *
 *   THRESHOLD_ADMIN_PUBLIC_KEYS="<pk1>,<pk2>,<pk3>" yarn admin:threshold            # dry run: prints the plan
 *   THRESHOLD_ADMIN_PUBLIC_KEYS="<pk1>,<pk2>,<pk3>" yarn admin:threshold --execute  # creates the account
 *
 * Needs HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY (pays the fee) in packages/nextjs/.env.local. Only public keys are
 * read; the three private keys stay with their three holders. Afterwards set ADMIN_ADDRESS to the printed long-zero
 * address and run the deploy: `01_setup_dmrv_registry.ts` hands DEFAULT_ADMIN_ROLE to it and renounces the deployer.
 *
 * Lives in packages/nextjs because the Hedera SDK is a dependency here, not of packages/hardhat.
 */
import { AccountCreateTransaction, Client, Hbar, KeyList, PublicKey } from "@hiero-ledger/sdk";
import { existsSync } from "fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const THRESHOLD = 2;

export function thresholdKeyList(publicKeys: string[]): KeyList {
  if (publicKeys.length !== 3) throw new Error("Pass exactly three public keys (2-of-3)");
  const keys = publicKeys.map(k => PublicKey.fromString(k.trim()));
  if (new Set(keys.map(k => k.toStringRaw())).size !== 3) throw new Error("The three keys must be distinct");
  return new KeyList(keys, THRESHOLD);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const raw = process.env.THRESHOLD_ADMIN_PUBLIC_KEYS;
  if (!raw) throw new Error('Set THRESHOLD_ADMIN_PUBLIC_KEYS="<pk1>,<pk2>,<pk3>" (public keys only)');
  const keyList = thresholdKeyList(raw.split(","));
  console.log(
    `Key list: ${THRESHOLD}-of-3\n${keyList
      .toArray()
      .map(k => `  ${k.toString()}`)
      .join("\n")}`,
  );
  if (!execute) {
    console.log(
      "\nDry run. Re-run with --execute to create the account (the operator pays about 0.05 HBAR + 5 HBAR balance).",
    );
    return;
  }

  const { readOperatorConfig } = await import("~~/services/mrv/server/config");
  const operator = readOperatorConfig();
  if (!operator) throw new Error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in packages/nextjs/.env.local");
  const network = process.env.HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  const client = network.setOperator(operator.accountId, operator.privateKey);
  try {
    const receipt = await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(keyList)
        .setInitialBalance(new Hbar(5))
        .setAccountMemo("dMRV threshold admin (2-of-3)")
        .execute(client)
    ).getReceipt(client);
    const accountId = receipt.accountId;
    if (!accountId) throw new Error("No account id in the receipt");
    console.log(`\nThreshold admin account: ${accountId.toString()}`);
    console.log(`EVM (long-zero) address: 0x${accountId.toEvmAddress()}`);
    console.log(`\nNext: ADMIN_ADDRESS=0x${accountId.toEvmAddress()} yarn deploy --network hederaTestnet`);
  } finally {
    client.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
