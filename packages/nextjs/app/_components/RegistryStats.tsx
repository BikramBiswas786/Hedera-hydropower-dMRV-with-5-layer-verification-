"use client";

import { ExternalLink, NotDeployedNotice, StatCard } from "~~/components/hydro/ui";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { evmToEntityId, hashscan } from "~~/services/mrv/network";
import { formatMwh } from "~~/services/mrv/views";

export const RegistryStats = () => {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployment, isLoading } = useDeployedContractInfo({ contractName: "HydroREC" });
  const { data: certifiedWh } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "totalCertifiedWh" });
  const { data: retired } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "totalRetiredUnits" });
  const { data: attestations } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "attestationCount",
  });
  const { data: plantIds } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "getPlantIds" });
  const { data: recToken } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "recToken" });

  if (!isLoading && !deployment) return <NotDeployedNotice networkName={targetNetwork.name} />;

  const tokenId = recToken ? evmToEntityId(recToken) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold m-0">Registry on {targetNetwork.name}</h2>
        <div className="flex gap-4 text-sm">
          {deployment && tokenId && (
            <ExternalLink href={hashscan.contract(deployment.address)}>HydroREC contract</ExternalLink>
          )}
          {recToken && tokenId && <ExternalLink href={hashscan.token(recToken)}>HREC token {tokenId}</ExternalLink>}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Certified generation"
          value={certifiedWh === undefined ? "…" : `${formatMwh(certifiedWh / 1_000n)} MWh`}
        />
        <StatCard label="RECs retired" value={retired === undefined ? "…" : `${formatMwh(retired)} MWh`} />
        <StatCard label="Attestations" value={attestations?.toString() ?? "…"} />
        <StatCard label="Registered plants" value={plantIds?.length ?? "…"} />
      </div>
    </section>
  );
};
