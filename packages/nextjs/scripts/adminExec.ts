/**
 * Admin calls on DmrvRegistry / CreditMarket from the 2-of-3 threshold account, as Hedera scheduled transactions:
 * one holder schedules the ContractExecute, a second signs it, and the network executes once 2 of 3 have signed.
 *
 *   yarn admin:exec plan     <contract> "<signature>" [args…]   # dry run: prints calldata, sends nothing
 *   yarn admin:exec schedule <contract> "<signature>" [args…]   # holder 1: ScheduleCreate (signs with ADMIN_SIGNER_KEY)
 *   yarn admin:exec sign     <scheduleId>                        # holder 2: ScheduleSign  (signs with ADMIN_SIGNER_KEY)
 *
 * Example: yarn admin:exec plan 0xMarket "setPoolGuardEnabled(bool)" true
 *
 * Env: ADMIN_ACCOUNT_ID (the threshold account, e.g. 0.0.1234), ADMIN_SIGNER_KEY (this holder's private key, kept
 * on the holder's machine), HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY (pays the schedule fee), HEDERA_NETWORK.
 */
import {
  AccountId,
  Client,
  ContractExecuteTransaction,
  ContractId,
  ScheduleCreateTransaction,
  ScheduleId,
  ScheduleSignTransaction,
} from "@hiero-ledger/sdk";
import { existsSync } from "fs";
import { type Hex, encodeFunctionData, getAddress, parseAbiItem } from "viem";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const GAS = 400_000;

function coerce(type: string, value: string): unknown {
  if (type === "bool") return value === "true";
  if (/^u?int\d*$/.test(type)) return BigInt(value);
  if (type === "address") return getAddress(value);
  if (type.endsWith("[]") || type.startsWith("tuple")) return JSON.parse(value);
  return value;
}

/** Calldata for `signature` (e.g. "grantRole(bytes32,address)") with CLI string arguments. */
export function encodeAdminCall(signature: string, args: string[]): Hex {
  const item = parseAbiItem(`function ${signature}`);
  if (item.type !== "function") throw new Error(`Not a function signature: ${signature}`);
  if (item.inputs.length !== args.length) {
    throw new Error(`${item.name} takes ${item.inputs.length} arguments, got ${args.length}`);
  }
  return encodeFunctionData({
    abi: [item],
    functionName: item.name,
    args: item.inputs.map((p, i) => coerce(p.type, args[i])),
  });
}

async function client() {
  const { readOperatorConfig, parsePrivateKey } = await import("~~/services/mrv/server/config");
  const operator = readOperatorConfig();
  if (!operator) throw new Error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in packages/nextjs/.env.local");
  const signer = process.env.ADMIN_SIGNER_KEY;
  if (!signer) throw new Error("Set ADMIN_SIGNER_KEY to this holder's key (one of the three in the key list)");
  const network = process.env.HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  return { client: network.setOperator(operator.accountId, operator.privateKey), signer: parsePrivateKey(signer) };
}

async function main() {
  const [command, target, signature, ...args] = process.argv.slice(2);
  if (command === "plan" || command === "schedule") {
    if (!target || !signature) throw new Error('Usage: admin:exec plan|schedule <contract 0x…> "<fn(types)>" [args…]');
    const data = encodeAdminCall(signature, args);
    console.log(`Contract: ${getAddress(target)}\nCall:     ${signature} ${args.join(" ")}\nCalldata: ${data}`);
    if (command === "plan") return console.log("\nDry run: nothing was sent.");

    const adminId = process.env.ADMIN_ACCOUNT_ID;
    if (!adminId) throw new Error("Set ADMIN_ACCOUNT_ID to the threshold account (0.0.x)");
    const { client: c, signer } = await client();
    try {
      const inner = new ContractExecuteTransaction()
        .setContractId(ContractId.fromEvmAddress(0, 0, target))
        .setGas(GAS)
        .setFunctionParameters(Buffer.from(data.slice(2), "hex"));
      const tx = await new ScheduleCreateTransaction()
        .setScheduledTransaction(inner.setTransactionMemo(`admin ${signature}`))
        .setPayerAccountId(AccountId.fromString(adminId))
        .setScheduleMemo(`dMRV admin: ${signature}`)
        .freezeWith(c)
        .sign(signer);
      const receipt = await (await tx.execute(c)).getReceipt(c);
      console.log(
        `Scheduled ${receipt.scheduleId?.toString()} (1 of 2 signatures). Second holder: yarn admin:exec sign ${receipt.scheduleId?.toString()}`,
      );
    } finally {
      c.close();
    }
    return;
  }
  if (command === "sign") {
    if (!target) throw new Error("Usage: admin:exec sign <scheduleId>");
    const { client: c, signer } = await client();
    try {
      const tx = await new ScheduleSignTransaction()
        .setScheduleId(ScheduleId.fromString(target))
        .freezeWith(c)
        .sign(signer);
      const receipt = await (await tx.execute(c)).getReceipt(c);
      console.log(`Signed ${target}: ${receipt.status.toString()}. It executes once 2 of 3 keys have signed.`);
    } finally {
      c.close();
    }
    return;
  }
  console.log('Usage: admin:exec plan|schedule <contract> "<fn(types)>" [args…] | sign <scheduleId>');
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
