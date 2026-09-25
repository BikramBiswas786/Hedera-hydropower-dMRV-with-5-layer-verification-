import Link from "next/link";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { trustChainFor } from "~~/services/mrv/documents/server";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Documents",
  description: "Sealed VCS-shaped documents for the demo plants. Reading needs no key.",
});

const SUBJECTS = ["HYDRO-DEMO-01", "HYDRO-DEMO-02"];

const DocumentsPage: NextPage = async () => {
  const chains = await Promise.all(SUBJECTS.map(id => trustChainFor(id)));
  return (
    <div className="flex flex-col gap-6 py-8 px-5 lg:px-10 max-w-5xl mx-auto w-full">
      <PageHeader title="Documents">
        Five sealed records per plant: project description, validation, registry decision, monitoring report, verification.
        Each cites the hash of the one before it. This does not mint credits. The demo signer is a public Anvil key, not
        an operator.
      </PageHeader>
      {chains.map(chain => (
        <section key={chain.subjectId} className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/documents/${chain.subjectId}`} className="text-xl font-bold">
              {chain.subjectId}
            </Link>
            <span className="badge badge-outline">{chain.status}</span>
          </div>
          <ol className="m-0 pl-5 text-sm">
            {chain.documents.map(doc => (
              <li key={doc.type}>
                {doc.type} · {doc.intact ? "intact" : "broken"}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
};

export default DocumentsPage;
