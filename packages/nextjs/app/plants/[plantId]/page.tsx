import { notFound } from "next/navigation";
import { PlantDetailView } from "../_components/PlantDetailView";
import type { Metadata, NextPage } from "next";
import { NetworkErrorNotice, NotDeployedNotice } from "~~/components/hydro/ui";
import scaffoldConfig from "~~/scaffold.config";
import { ApiError } from "~~/services/mrv/server/errors";
import { getPlantDetail } from "~~/services/mrv/server/insights";
import { RegistryNotDeployedError } from "~~/services/mrv/server/registry";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ plantId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const plantId = decodeURIComponent((await params).plantId);
  return getMetadata({
    title: plantId,
    description: `Registered design, attestations and credits issued for hydropower plant ${plantId}`,
  });
}

const PlantPage: NextPage<Params> = async ({ params }) => {
  const plantId = decodeURIComponent((await params).plantId);
  let content;
  try {
    content = <PlantDetailView detail={await getPlantDetail(plantId)} />;
  } catch (error) {
    if (error instanceof RegistryNotDeployedError) {
      content = <NotDeployedNotice networkName={scaffoldConfig.targetNetworks[0].name} />;
    } else if (error instanceof ApiError && (error.httpStatus === 404 || error.httpStatus === 400)) {
      notFound();
    } else {
      console.error("[plant]", error);
      content = <NetworkErrorNotice message="The JSON-RPC relay did not answer." />;
    }
  }
  return <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">{content}</div>;
};

export default PlantPage;
