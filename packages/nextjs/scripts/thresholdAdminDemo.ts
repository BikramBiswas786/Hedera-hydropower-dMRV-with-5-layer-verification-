/**
 * The 2-of-3 admin path end to end on testnet, with throwaway keys: a threshold account made admin of a contract,
 * an admin call that waits for a second signature, and an exit through the same path.
 *
 *   CONTRACT_ADDRESS=0x… HEDERA_OPERATOR_ID=0.0.x HEDERA_OPERATOR_KEY=… yarn admin:demo
 *
 * The operator must hold DEFAULT_ADMIN_ROLE on the contract (it grants the role to the new account and pays the
 * fees). Steps:
 * 1. Three fresh keys and a 2-of-3 KeyList account (createThresholdAdmin's key list), granted DEFAULT_ADMIN_ROLE.
 * 2. Holder 1 schedules `setPoolGuardEnabled(true)` with the account as payer. The schedule stays pending: one
 *    signature of three does not meet the threshold.
 * 3. Holder 2 signs (ScheduleSign) and the network executes the call.
 * 4. Holder 3 schedules `renounceRole(DEFAULT_ADMIN_ROLE, account)` and holder 1 signs: any two of the three suffice,
 *    and the throwaway account leaves the contract with no admin rights.
 *
 * The keys live only in this process. Testnet evidence, not part of the product; the Checkout testnet demo workflow
 * runs it (threshold_admin_demo).
 */
import { encodeAdminCall } from "./adminExec";
import { thresholdKeyList } from "./createThresholdAdmin";
import {
  AccountCreateTransaction,
  Client,
  ContractExecuteTransaction,
  ContractId,
  Hbar,
  PrivateKey,
  ScheduleCreateTransaction,
  ScheduleId,
  ScheduleInfoQuery,
  ScheduleSignTransaction,
  type TransactionId,
} from "@hiero-ledger/sdk";
import { existsSync } from "fs";
import { type Address, createPublicClient, getAddress, http, parseAbi } from "viem";
import { hederaTestnet } from "viem/chains";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const DEFAULT_ADMIN_ROLE = `0x${"00".repeat(32)}`;
const GAS = 400_000;
const hashscan = (path: string) => `https://hashscan.io/testnet/${path}`;
const txLink = (id: TransactionId) => hashscan(`transaction/${id.toString()}`);

async function main() {
  if (process.env.HEDERA_NETWORK === "mainnet") throw new Error("Testnet only: the keys are thrown away afterwards");
  const target = getAddress(process.env.CONTRACT_ADDRESS ?? "");
  const { readOperatorConfig } = await import("~~/services/mrv/server/config");
  const operator = readOperatorConfig();
  if (!operator) throw new Error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY (an admin of the contract)");
  const client = Client.forTestnet().setOperator(operator.accountId, operator.privateKey);
  const contractId = ContractId.fromEvmAddress(0, 0, target);
  const reader = createPublicClient({ chain: hederaTestnet, transport: http() });
  const hasRole = (account: Address) =>
    reader.readContract({
      address: target,
      abi: parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]),
      functionName: "hasRole",
      args: [DEFAULT_ADMIN_ROLE as `0x${string}`, account],
    });

  try {
    const holders = [0, 1, 2].map(() => PrivateKey.generateED25519());
    const created = await new AccountCreateTransaction()
      .setKeyWithoutAlias(thresholdKeyList(holders.map(k => k.publicKey.toString())))
      .setInitialBalance(new Hbar(5))
      .setAccountMemo("dMRV threshold admin demo (2-of-3, throwaway keys)")
      .execute(client);
    const accountId = (await created.getReceipt(client)).accountId!;
    // A key-list account has no EVM alias, so contracts see its long-zero address as msg.sender.
    const admin: Address = getAddress(`0x${accountId.toEvmAddress()}`);
    console.log(`1. 2-of-3 account ${accountId} (${admin}): ${txLink(created.transactionId)}`);

    const grant = await new ContractExecuteTransaction()
      .setContractId(contractId)
      .setGas(200_000)
      .setFunctionParameters(
        Buffer.from(encodeAdminCall("grantRole(bytes32,address)", [DEFAULT_ADMIN_ROLE, admin]).slice(2), "hex"),
      )
      .execute(client);
    await grant.getReceipt(client);
    console.log(`   granted DEFAULT_ADMIN_ROLE on ${target}: ${txLink(grant.transactionId)}`);

    const schedule = async (signature: string, args: string[], holder: PrivateKey) => {
      const inner = new ContractExecuteTransaction()
        .setContractId(contractId)
        .setGas(GAS)
        .setFunctionParameters(Buffer.from(encodeAdminCall(signature, args).slice(2), "hex"))
        .setTransactionMemo(`2-of-3 admin ${signature}`);
      const response = await (
        await new ScheduleCreateTransaction()
          .setScheduledTransaction(inner)
          .setPayerAccountId(accountId)
          .setScheduleMemo(`dMRV 2-of-3 demo ${signature} ${Date.now()}`)
          .freezeWith(client)
          .sign(holder)
      ).execute(client);
      const scheduleId = (await response.getReceipt(client)).scheduleId!;
      const info = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(client);
      if (info.executed) throw new Error(`Schedule ${scheduleId} ran on one signature; the threshold is not 2`);
      return { scheduleId, created: response.transactionId };
    };
    const sign = async (scheduleId: ScheduleId, holder: PrivateKey) => {
      const response = await (
        await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client).sign(holder)
      ).execute(client);
      const receipt = await response.getReceipt(client);
      const info = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(client);
      if (!info.executed) throw new Error(`Schedule ${scheduleId} did not execute after the second signature`);
      return {
        signed: response.transactionId,
        executed: receipt.scheduledTransactionId ?? info.scheduledTransactionId,
      };
    };

    const guard = await schedule("setPoolGuardEnabled(bool)", ["true"], holders[0]);
    console.log(
      `2. holder 1 scheduled setPoolGuardEnabled(true): ${hashscan(`schedule/${guard.scheduleId}`)} (pending, 1 of 3)`,
    );
    const guardDone = await sign(guard.scheduleId, holders[1]);
    console.log(
      `3. holder 2 signed ${txLink(guardDone.signed)}; the network ran ${guardDone.executed ? txLink(guardDone.executed) : "the call"}`,
    );

    const exit = await schedule("renounceRole(bytes32,address)", [DEFAULT_ADMIN_ROLE, admin], holders[2]);
    const exitDone = await sign(exit.scheduleId, holders[0]);
    // JSON-RPC reads come from the mirror node, a few seconds behind consensus.
    for (let attempt = 0; (await hasRole(admin)) && attempt < 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3_000));
      if (attempt === 9) throw new Error(`${admin} still holds DEFAULT_ADMIN_ROLE`);
    }
    console.log(
      `4. holder 3 scheduled renounceRole (${hashscan(`schedule/${exit.scheduleId}`)}), holder 1 signed ${txLink(exitDone.signed)}: ${admin} holds no admin role`,
    );
  } finally {
    client.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
