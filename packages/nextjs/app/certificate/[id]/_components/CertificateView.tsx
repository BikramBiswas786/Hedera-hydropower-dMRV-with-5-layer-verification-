"use client";

import { useAccount, useWriteContract } from "wagmi";
import { ExternalLink, NotDeployedNotice } from "~~/components/hydro/ui";
import { HederaAddress } from "~~/components/scaffold-hbar";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
  useTransactor,
} from "~~/hooks/scaffold-hbar";
import { evmToEntityId, hashscan } from "~~/services/mrv/network";
import { type RawRetirement, formatTonnes, toRetirementView } from "~~/services/mrv/views";

/** HIP-719: HTS tokens, NFTs included, expose `associate()` at their EVM address. */
const HRC719_ABI = [
  { type: "function", name: "associate", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
] as const;

export const CertificateView = ({ retirementId }: { retirementId: bigint }) => {
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const { data: deployment, isLoading } = useDeployedContractInfo({ contractName: "DmrvRegistry" });
  const { data: count } = useScaffoldReadContract({
    contractName: "DmrvRegistry",
    functionName: "retirementCount",
  });
  const exists = count !== undefined && retirementId < count;
  const { data: raw } = useScaffoldReadContract({
    contractName: "DmrvRegistry",
    functionName: "getRetirement",
    args: [retirementId],
    query: { enabled: exists },
  });
  const { data: certificateToken } = useScaffoldReadContract({
    contractName: "DmrvRegistry",
    functionName: "certificateToken",
  });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "DmrvRegistry" });
  const { writeContractAsync: writeToken } = useWriteContract();
  const transact = useTransactor();

  if (!isLoading && !deployment) return <NotDeployedNotice networkName={targetNetwork.name} />;
  if (count !== undefined && !exists) {
    return (
      <p className="text-lg">
        Retirement #{retirementId.toString()} does not exist on {targetNetwork.name}.
      </p>
    );
  }
  if (!raw) return <span className="loading loading-spinner" aria-label="Loading certificate" />;

  const retirement = toRetirementView(raw as RawRetirement, Number(retirementId));
  const hasNft = retirement.certificateSerial > 0 && certificateToken;
  const isHolder = address?.toLowerCase() === retirement.account.toLowerCase();
  const date = new Date(retirement.timestamp * 1_000);

  return (
    <div className="flex flex-col gap-4">
      <article className="bg-base-100 border-4 border-double border-primary/40 rounded-2xl p-8 md:p-12 flex flex-col gap-6 text-center print:border-black">
        <header className="flex flex-col gap-1">
          <span className="uppercase tracking-[0.3em] text-xs text-base-content/60">Hydro dMRV · Hedera</span>
          <h1 className="text-3xl md:text-4xl font-bold m-0">Retirement Certificate</h1>
          <span className="text-base-content/60">No. {retirement.id}</span>
        </header>

        <p className="m-0 text-lg">This certifies that</p>
        <p className="m-0 text-5xl font-bold text-primary">{formatTonnes(retirement.units)} t CO₂e</p>
        <p className="m-0 text-lg">
          of verified emission reductions from grid-connected hydropower were permanently retired
          {retirement.beneficiary && (
            <>
              {" "}
              on behalf of <strong>{retirement.beneficiary}</strong>
            </>
          )}{" "}
          on {date.toISOString().slice(0, 10)}.
        </p>
        <p className="m-0 text-sm text-base-content/70">
          The corresponding credit tokens were burned on the Hedera Token Service. Each was issued by the registry
          contract only after an accredited VVB verified the plant&apos;s meter-signed monitoring records, with ER = BE
          − PE − LE recomputed on-chain under the methodology the plant registered (Verra VMR0017 v1.0 with ACM0002
          v22.0 for the demo plants). The monitoring data and reports are on the Hedera Consensus Service and can be
          reproduced from public data on the Audit page.
        </p>
        <p className="m-0 text-xs text-base-content/60">
          These are verified emission reductions issued by this registry, not Verra VCUs, and this retirement is
          recorded on Hedera only. A claim based on it should say so, and the same reductions must not also be claimed
          through another instrument (a VCU, a renewable energy certificate).
          {targetNetwork.testnet &&
            " Testnet: demo plants with illustrative data and a labelled demo VVB key; these credits have no value."}
        </p>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left text-sm m-0">
          <div>
            <dt className="text-base-content/60">Retired by</dt>
            <dd className="m-0 flex">
              <HederaAddress address={retirement.account} chain={targetNetwork} />
            </dd>
          </div>
          <div>
            <dt className="text-base-content/60">Registry</dt>
            <dd className="m-0 flex">
              {deployment && <HederaAddress address={deployment.address} chain={targetNetwork} />}
            </dd>
          </div>
          <div>
            <dt className="text-base-content/60">Certificate NFT</dt>
            <dd className="m-0 flex">
              {hasNft ? (
                evmToEntityId(certificateToken) ? (
                  <ExternalLink href={hashscan.nft(certificateToken, retirement.certificateSerial)}>
                    {evmToEntityId(certificateToken)} · serial {retirement.certificateSerial}
                  </ExternalLink>
                ) : (
                  <span>serial {retirement.certificateSerial}</span>
                )
              ) : (
                <span className="text-base-content/60">not issued (collection created later)</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-base-content/60">NFT holder</dt>
            <dd className="m-0 flex">
              {!hasNft
                ? "—"
                : retirement.certificateDelivered
                  ? "In the retiring wallet"
                  : "Held by the registry until claimed"}
            </dd>
          </div>
        </dl>
      </article>

      <div className="flex flex-wrap gap-2 print:hidden">
        <button className="btn btn-sm btn-outline" onClick={() => window.print()}>
          Print / save as PDF
        </button>
        {hasNft && !retirement.certificateDelivered && isHolder && (
          <>
            <button
              className="btn btn-sm btn-outline"
              onClick={() =>
                transact(() => writeToken({ address: certificateToken, abi: HRC719_ABI, functionName: "associate" }))
              }
            >
              1. Associate certificate token
            </button>
            <button
              className="btn btn-sm btn-primary"
              disabled={isMining}
              onClick={() => writeContractAsync({ functionName: "claimCertificate", args: [retirementId] })}
            >
              2. Claim NFT
            </button>
          </>
        )}
      </div>
    </div>
  );
};
