"use client";

import { ExternalLink, NotDeployedNotice, StatCard } from "~~/components/hydro/ui";
import { useDeployedContractInfo, useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { evmToEntityId, hashscan } from "~~/services/mrv/network";
import { formatTonnes } from "~~/services/mrv/views";

export const RegistryStats = () => {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployment, isLoading } = useDeployedContractInfo({ contractName: "HydroCreditRegistry" });
  const { data: issued } = useScaffoldReadContract({
    contractName: "HydroCreditRegistry",
    functionName: "totalIssuedUnits",
  });
  const { data: retired } = useScaffoldReadContract({
    contractName: "HydroCreditRegistry",
    functionName: "totalRetiredUnits",
  });
  const { data: attestations } = useScaffoldReadContract({
    contractName: "HydroCreditRegistry",
    functionName: "attestationCount",
  });
  const { data: plantIds } = useScaffoldReadContract({
    contractName: "HydroCreditRegistry",
    functionName: "getPlantIds",
  });
  const { data: creditToken } = useScaffoldReadContract({
    contractName: "HydroCreditRegistry",
    functionName: "creditToken",
  });

  if (!isLoading && !deployment) return <NotDeployedNotice networkName={targetNetwork.name} />;

  const tokenId = creditToken ? evmToEntityId(creditToken) : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold m-0">Registry on {targetNetwork.name}</h2>
        <div className="flex gap-4 text-sm">
          {deployment && tokenId && (
            <ExternalLink href={hashscan.contract(deployment.address)}>Registry contract</ExternalLink>
          )}
          {creditToken && tokenId && (
            <ExternalLink href={hashscan.token(creditToken)}>Credit token {tokenId}</ExternalLink>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Credits issued" value={issued === undefined ? "…" : `${formatTonnes(issued)} t CO₂e`} />
        <StatCard label="Credits retired" value={retired === undefined ? "…" : `${formatTonnes(retired)} t CO₂e`} />
        <StatCard label="Attestations" value={attestations?.toString() ?? "…"} />
        <StatCard label="Registered plants" value={plantIds?.length ?? "…"} />
      </div>
    </section>
  );
};
