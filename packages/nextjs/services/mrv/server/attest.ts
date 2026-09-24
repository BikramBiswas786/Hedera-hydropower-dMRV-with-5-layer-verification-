import { type VerificationReport, verifyReadings } from "../engine";
import { hashscan, isLiveHederaChain } from "../network";
import { buildHcsMessage } from "../report";
import { DEMO_PLANT } from "../scenarios";
import type { VerifyRequest } from "../schema";
import { plantIdToBytes32 } from "../views";
import { readOperatorConfig, readVerifierKey } from "./config";
import { publishReport } from "./hcs";
import { getPlant, hydroChain, hydroTransport, requireDeployment } from "./registry";
import { BaseError, ContractFunctionRevertedError, createWalletClient, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export class AttestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

export type AttestOutcome =
  | { status: "not-eligible"; report: VerificationReport; hcsMessage: string; reportHash: string }
  | {
      status: "attested";
      report: VerificationReport;
      hcsMessage: string;
      reportHash: string;
      attestationId: number;
      unitsMinted: number;
      hcs: { topicId: string; sequenceNumber: number; transactionId: string; url: string } | null;
      /** `url` is a Hashscan link on Hedera networks and `null` on a local chain. */
      transaction: { hash: string; url: string | null };
    };

function revertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.shortMessage;
    return error.shortMessage;
  }
  return (error as Error).message;
}

/**
 * Verify → anchor on HCS → attest on-chain. Only APPROVED batches are published; everything else is returned
 * with its report so an operator (or agent) can see exactly why.
 */
export async function attestReadings(request: VerifyRequest): Promise<AttestOutcome> {
  const plant = request.plant ?? DEMO_PLANT;
  const report = verifyReadings(request.readings, plant, request.gridEmissionFactor);
  const { message, reportHash } = buildHcsMessage(report, request.readings);
  if (report.decision !== "APPROVED") return { status: "not-eligible", report, hcsMessage: message, reportHash };

  const { address, abi, client } = requireDeployment();
  const plantId = plantIdToBytes32(plant.plantId);
  const registered = await getPlant(plantId);
  if (!registered) throw new AttestError(`Plant ${plant.plantId} is not registered on-chain`, 409);
  if (registered.capacityKw !== plant.capacityKw) {
    throw new AttestError(
      `Plant profile capacity ${plant.capacityKw} kW differs from the on-chain registration (${registered.capacityKw} kW)`,
      409,
    );
  }

  const operator = readOperatorConfig();
  const verifierKey = readVerifierKey(operator);
  if (!verifierKey)
    throw new AttestError("No verifier key: set HEDERA_OPERATOR_KEY (ECDSA) or VERIFIER_PRIVATE_KEY", 503);
  if (!operator && isLiveHederaChain()) {
    throw new AttestError("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are required to anchor reports on HCS", 503);
  }

  const account = privateKeyToAccount(verifierKey);
  const input = {
    plantId,
    periodStart: BigInt(report.periodStart),
    periodEnd: BigInt(report.periodEnd),
    energyWh: BigInt(report.energyWh),
    trustScoreBps: report.trustScoreBps,
    reportHash,
    hcsTopicNum: 0n,
    hcsSequence: 0n,
  };

  // Dry-run first so role, period, capacity and trust errors surface before anything is written to HCS.
  try {
    await client.simulateContract({ account, address, abi, functionName: "submitAttestation", args: [input] });
  } catch (error) {
    throw new AttestError(`The registry would reject this attestation: ${revertReason(error)}`, 409);
  }

  const hcs = operator ? await publishReport(operator, message) : null;
  const wallet = createWalletClient({ account, chain: hydroChain(), transport: hydroTransport() });
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: "submitAttestation",
    args: [{ ...input, hcsTopicNum: hcs?.topicNum ?? 0n, hcsSequence: hcs?.sequenceNumber ?? 0n }],
    // HTS system-contract calls are under-estimated by eth_estimateGas on some relays.
    gas: 800_000n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new AttestError(`Attestation transaction ${hash} reverted`, 502);

  const [event] = parseEventLogs({ abi, logs: receipt.logs, eventName: "AttestationSubmitted" });
  return {
    status: "attested",
    report,
    hcsMessage: message,
    reportHash,
    attestationId: Number(event.args.attestationId),
    unitsMinted: Number(event.args.unitsMinted),
    hcs: hcs && {
      topicId: hcs.topicId,
      sequenceNumber: Number(hcs.sequenceNumber),
      transactionId: hcs.transactionId,
      url: hashscan.topicMessage(hcs.topicId, hcs.sequenceNumber.toString()),
    },
    transaction: { hash, url: isLiveHederaChain() ? hashscan.transaction(hash) : null },
  };
}
