import { notFound } from "next/navigation";
import { CertificateView } from "./_components/CertificateView";
import type { NextPage } from "next";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Retirement certificate",
  description: "Proof that hydropower RECs were permanently retired on Hedera",
});

const CertificatePage: NextPage<{ params: Promise<{ id: string }> }> = async ({ params }) => {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return (
    <div className="px-5 py-8 max-w-3xl w-full mx-auto">
      <CertificateView retirementId={BigInt(id)} />
    </div>
  );
};

export default CertificatePage;
