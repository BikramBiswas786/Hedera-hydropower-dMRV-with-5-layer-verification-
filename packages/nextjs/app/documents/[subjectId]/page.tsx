import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { trustChainFor } from "~~/services/mrv/documents/server";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Trust chain",
  description: "Hash-linked VCS sections for one subject",
});

const SubjectPage: NextPage<{ params: Promise<{ subjectId: string }> }> = async ({ params }) => {
  const { subjectId } = await params;
  const chain = await trustChainFor(decodeURIComponent(subjectId));
  return (
    <div className="flex flex-col gap-6 py-8 px-5 lg:px-10 max-w-3xl mx-auto w-full">
      <PageHeader title={chain.subjectId}>
        Status {chain.status}
        {chain.creditsKg != null ? ` · ${chain.creditsKg.toLocaleString("en-US")} kg on the hydro registry` : ""}.
      </PageHeader>
      {chain.documents.map(doc => (
        <section key={doc.type} className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-2">
          <h2 className="text-lg font-bold m-0">
            {doc.type} · {doc.role}
          </h2>
          <p className="text-xs break-all m-0 opacity-70">{doc.hash}</p>
          {Object.entries(doc.sections).map(([section, text]) => (
            <p key={section} className="m-0 text-sm">
              <strong>{section}.</strong> {text}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
};

export default SubjectPage;
