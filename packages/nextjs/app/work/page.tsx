import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { runPublicWork } from "~~/services/mrv/documents/work";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Work",
  description: "The public playbook an agent can run without a key",
});

const WorkPage: NextPage = async () => {
  const hydro = await runPublicWork("HYDRO-DEMO-01");
  const water = await runPublicWork("WATER-DEMO-01");
  return (
    <div className="flex flex-col gap-6 py-8 px-5 lg:px-10 max-w-3xl mx-auto w-full">
      <PageHeader title="Work">
        The same five steps for a hydro plant and for a safe-water project. Agents call <code>run_public_work</code>. No
        key.
      </PageHeader>
      {[hydro, water].map(job => (
        <section key={job.subjectId} className="bg-base-100 border border-base-300 rounded-2xl p-5">
          <h2 className="text-xl font-bold m-0">{job.subjectId}</h2>
          <ol className="m-0 pl-5">
            {job.steps.map(step => (
              <li key={step.name}>
                <strong>{step.name}.</strong> {step.detail}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
};

export default WorkPage;
