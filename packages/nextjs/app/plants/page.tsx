import Link from "next/link";
import type { NextPage } from "next";
import { NetworkErrorNotice, NotDeployedNotice, PageHeader, StatCard } from "~~/components/hydro/ui";
import scaffoldConfig from "~~/scaffold.config";
import { SMALL_SCALE_LIMIT_KW } from "~~/services/mrv/methodology/project";
import { listPlants } from "~~/services/mrv/server/insights";
import { RegistryNotDeployedError } from "~~/services/mrv/server/registry";
import { formatTonnes, formatWhAsMwh } from "~~/services/mrv/views";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const dynamic = "force-dynamic";

export const metadata = getMetadata({
  title: "Registered plants",
  description: "Hydropower plants registered on Hedera with their validated design and credits issued",
});

const PlantsPage: NextPage = async () => {
  let plants;
  let failure: string | null = null;
  try {
    plants = await listPlants();
  } catch (error) {
    plants = null;
    if (!(error instanceof RegistryNotDeployedError)) {
      console.error("[plants]", error);
      failure = "The JSON-RPC relay did not answer.";
    }
  }

  return (
    <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
      <PageHeader title="Registered plants">
        <p className="mt-2">
          Each plant is registered on-chain with its validated design: capacity, reservoir, TOOL07 grid emission factor,
          fuel coefficient, baseline and crediting period. The contract quantifies every monitoring period against it,
          so these totals are exactly what was minted.
        </p>
      </PageHeader>
      {failure ? (
        <NetworkErrorNotice message={failure} />
      ) : plants === null ? (
        <NotDeployedNotice networkName={scaffoldConfig.targetNetworks[0].name} />
      ) : plants.length === 0 ? (
        <p>No plants are registered yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plants.map(plant => (
            <Link
              key={plant.plantId}
              href={`/plants/${encodeURIComponent(plant.plantId)}`}
              className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3 hover:border-primary transition-colors no-underline"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-base-content/60">{plant.plantId}</span>
                <span className="badge badge-outline badge-sm">
                  {plant.design.capacityKw > SMALL_SCALE_LIMIT_KW ? "ACM0002" : "AMS-I.D"}
                </span>
                {!plant.active && <span className="badge badge-warning badge-sm">inactive</span>}
              </div>
              <h2 className="text-xl font-bold m-0">{plant.name}</h2>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Capacity" value={`${(plant.design.capacityKw / 1_000).toLocaleString()} MW`} />
                <StatCard label="Exported" value={`${formatWhAsMwh(plant.totalNetWh)} MWh`} />
                <StatCard label="Issued" value={`${formatTonnes(plant.issuedUnits)} t`} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlantsPage;
