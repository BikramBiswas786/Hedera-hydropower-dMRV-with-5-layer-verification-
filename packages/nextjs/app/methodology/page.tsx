import type { ReactNode } from "react";
import type { NextPage } from "next";
import { PageHeader } from "~~/components/hydro/ui";
import { DEMO_ASSESSMENTS, DEMO_DESIGNS, DEMO_GRID } from "~~/services/mrv/demo";
import { DECISION_RULES } from "~~/services/mrv/engine";
import { FUELS } from "~~/services/mrv/methodology/fuels";
import {
  METHODOLOGIES,
  MIN_POWER_DENSITY,
  RESERVOIR_EMISSIONS_POWER_DENSITY,
} from "~~/services/mrv/methodology/project";
import { unitEmissionFactor } from "~~/services/mrv/methodology/tool07";
import { buildProjectMessage } from "~~/services/mrv/report";
import { getMetadata } from "~~/utils/scaffold-hbar/getMetadata";

export const metadata = getMetadata({
  title: "Methodology",
  description:
    "Verra VMR0017 v1.0 with ACM0002 v22.0, and CDM AMS-I.D / ACM0002, as implemented by the engine and the contract",
});

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
    <h2 className="font-semibold text-lg m-0">{title}</h2>
    {children}
  </section>
);

const Eq = ({ children }: { children: ReactNode }) => (
  <pre className="bg-base-200 rounded-xl p-3 text-xs overflow-x-auto m-0 whitespace-pre">{children}</pre>
);

const t = (value: number, digits = 6) => value.toLocaleString("en-US", { maximumFractionDigits: digits });

const latestYear = DEMO_GRID.years.reduce((a, b) => (b.year > a.year ? b : a));
const unitFactors = DEMO_GRID.units
  .filter(unit => (latestYear.units[unit.id]?.mwh ?? 0) > 0)
  .map(unit => unitEmissionFactor(unit, latestYear.units[unit.id]));

const MethodologyPage: NextPage = () => (
  <div className="flex flex-col gap-6 px-5 py-8 max-w-6xl w-full mx-auto">
    <PageHeader title="Methodology">
      <p className="mt-2">
        Each plant is registered under one of two rule sets. <strong>Verra VMR0017</strong> v
        {METHODOLOGIES.VMR0017.version} (23 April 2026), the demo plants&apos; methodology, is applied with{" "}
        <strong>{METHODOLOGIES.ACM0002.id}</strong> v{METHODOLOGIES.ACM0002.version} as it requires: hydro of 15 MW or
        less in Least Developed Countries, VT0008 additionality (a ±10% sensitivity table and a ±50% capacity band),
        EF_Res 100 kg CO₂e/MWh and embodied-emission leakage. The <strong>CDM</strong> rules (AMS-I.D v
        {METHODOLOGIES["AMS-I.D"].version} up to 15 MW, ACM0002 above) remain available; Verra inactivates them as
        standalone methodologies on 1 January 2027. <strong>TOOL03</strong> prices fossil fuel burnt on site. The grid
        factor follows <strong>TOOL07</strong> v7.0 for CDM plants and Verra&apos;s <strong>VT0011</strong> v1.0
        revision of it for VMR0017 plants (build margin over all units, hydro weights 0.4 / 0.6). The same integer
        arithmetic runs in this app, in the MCP server and inside the <code>HydroCreditRegistry</code> contract, and
        shared test vectors keep them identical.
      </p>
    </PageHeader>

    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div className="xl:col-span-3 flex flex-col">
        <Card title="Emission reductions">
          <Eq>{`ER_y  = BE_y − PE_y − LE_y
BE_y  = EG_PJ,y × EF_grid,CM,y          rounded down
PE_y  = PE_FF,y + PE_HP,y               rounded up
PE_FF = Σ FC × NCV × EF_CO2             TOOL03, IPCC upper bounds
PE_HP = EF_Res × TEG_y                  if ${MIN_POWER_DENSITY} < PD ≤ ${RESERVOIR_EMISSIONS_POWER_DENSITY} W/m², else 0
                                        EF_Res = 100 kg CO2e/MWh (VMR0017), 90 (CDM)
LE_y  = EG × EF_embodied                VMR0017 §8.3, 21 g CO2e/kWh for hydro,
                                        EG_facility (greenfield) or
                                        max(EG_PJ, EG_facility × Cap_add / Cap_PJ)
LE_y  = 0                               CDM; VMR0017 retrofit`}</Eq>
          <Eq>{`EG_PJ,y = EG_facility,y                        greenfield
EG_PJ,y = EG_facility,y − (EG_historical + σ)  retrofit, addition
          per crediting year, cumulatively; 0 after DATE_BaselineRetrofit
EG_facility = export − import at the grid meter, after QA/QC`}</Eq>
          <p className="text-sm text-base-content/70 m-0">
            Negative periods are carried forward and netted against later issuance. Sub-kilogram remainders carry too,
            so no rounding ever creates a credit.
          </p>
        </Card>
      </div>
      <div className="xl:col-span-2 flex flex-col">
        <Card title="Monitoring QA/QC (conservative by construction)">
          <ul className="text-sm m-0 pl-4 list-disc flex flex-col gap-1">
            <li>Replayed, out-of-order or overlapping intervals reject the period (double counting).</li>
            <li>
              Gaps are credited as zero; coverage below {DECISION_RULES.minCompletenessBps / 100}% needs review, and the
              contract enforces the same floor.
            </li>
            <li>Main vs check meter beyond their combined accuracy: the lower reading is used.</li>
            <li>Expired calibration: export × (1 − MPE), import × (1 + MPE).</li>
            <li>Export above gross generation is never credited.</li>
            <li>
              Generation above nameplate or above ρ·g·Q·H·η<sub>max</sub> credits the interval as zero; more than{" "}
              {DECISION_RULES.maxExcludedShare * 100}% such intervals reject the period.
            </li>
            <li>Water-to-wire efficiency outliers (modified z-score ≥ 3.5) go to review.</li>
            <li>Water quality is a safeguard: it can send a period to review but never changes the quantity.</li>
          </ul>
        </Card>
      </div>
    </div>

    <Card title={`TOOL07 on the demo grid: ${DEMO_GRID.system}`}>
      <p className="text-sm text-base-content/70 m-0">
        An illustrative grid, not a real country. {DEMO_GRID.operatingMargin} OM, 3-year generation-weighted (
        {DEMO_GRID.years.map(y => y.year).join(", ")}); the LCMR share averages{" "}
        {t((DEMO_GRID.lowCostMustRunShare.reduce((a, b) => a + b, 0) / 5) * 100, 1)}%, under the 50% the simple OM
        requires. EF_EL per unit below is for {latestYear.year}, IPCC lower bounds.
      </p>
      <div className="overflow-x-auto">
        <table className="table table-xs">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Source</th>
              <th className="text-right">Since</th>
              <th className="text-right">EG {latestYear.year} (MWh)</th>
              <th>Option</th>
              <th className="text-right">EF_EL (t/MWh)</th>
              <th>BM sample</th>
            </tr>
          </thead>
          <tbody>
            {unitFactors.map(unit => (
              <tr key={unit.id}>
                <td className="font-mono">{unit.id}</td>
                <td>
                  {unit.source}
                  {unit.cdm && <span className="badge badge-ghost badge-xs ml-1">CDM</span>}
                </td>
                <td className="text-right">{unit.commissioned}</td>
                <td className="text-right">{t(unit.mwh, 0)}</td>
                <td>{unit.option}</td>
                <td className="text-right font-mono">{t(unit.efTPerMwh, 4)}</td>
                <td>{DEMO_ASSESSMENTS[0].grid.tool07?.buildMargin.sample.some(s => s.id === unit.id) ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {DEMO_ASSESSMENTS.map((assessment, i) => {
        const tool07 = assessment.grid.tool07;
        const reg = assessment.registration;
        return (
          <Card key={assessment.plantId} title={`${assessment.plantId} · ${assessment.name}`}>
            <p className="m-0 text-sm">
              <span className="badge badge-outline mr-2">
                {assessment.methodology.id} v{assessment.methodology.version}
              </span>
              {assessment.eligible ? "eligible" : `not eligible: ${assessment.failures.join("; ")}`}
            </p>
            <table className="table table-xs">
              <tbody>
                <tr>
                  <td>Power density</td>
                  <td>{assessment.powerDensity.basis}</td>
                </tr>
                {tool07 && (
                  <>
                    <tr>
                      <td>Grid tool</td>
                      <td>{tool07.tool === "VT0011" ? "VT0011 v1.0 with TOOL07 v7.0" : "TOOL07 v7.0"}</td>
                    </tr>
                    <tr>
                      <td>EF_grid,OM</td>
                      <td className="font-mono">{t(tool07.operatingMargin.efTPerMwh)} t/MWh</td>
                    </tr>
                    <tr>
                      <td>EF_grid,BM</td>
                      <td className="font-mono">
                        {t(tool07.buildMargin.efTPerMwh)} t/MWh · step {tool07.buildMargin.step},{" "}
                        {tool07.buildMargin.sample.length} units
                      </td>
                    </tr>
                    <tr>
                      <td>Weights (crediting period {assessment.crediting.period})</td>
                      <td className="font-mono">
                        w_OM {tool07.weights.operatingMargin} · w_BM {tool07.weights.buildMargin}
                      </td>
                    </tr>
                  </>
                )}
                <tr>
                  <td>EF_grid,CM</td>
                  <td className="font-mono font-semibold">
                    {t(assessment.grid.efTPerMwh, 9)} t/MWh → registered {reg.efGridGPerMwh.toLocaleString("en-US")}{" "}
                    g/MWh (rounded down)
                  </td>
                </tr>
                <tr>
                  <td>TOOL03 COEF</td>
                  <td className="font-mono">
                    {assessment.projectEmissions.fuel
                      ? `${assessment.projectEmissions.fuel.label}: ${assessment.projectEmissions.fuel.ncvGjPerT} GJ/t × ${assessment.projectEmissions.fuel.co2KgPerTj.toLocaleString()} kg/TJ = ${t(assessment.projectEmissions.fuel.coefTPerT)} t/t`
                      : "no fuel"}
                  </td>
                </tr>
                <tr>
                  <td>Leakage</td>
                  <td>{assessment.leakage.basis}</td>
                </tr>
                <tr>
                  <td>Additionality</td>
                  <td>{assessment.additionality.basis}</td>
                </tr>
                <tr>
                  <td>Crediting</td>
                  <td>
                    {new Date(reg.creditingStart * 1_000).toISOString().slice(0, 10)} →{" "}
                    {new Date(reg.creditingEnd * 1_000).toISOString().slice(0, 10)} ({assessment.crediting.years} × 365
                    days)
                  </td>
                </tr>
              </tbody>
            </table>
            <details className="collapse collapse-arrow bg-base-200">
              <summary className="collapse-title text-sm font-medium">Registered on-chain</summary>
              <div className="collapse-content">
                <pre className="text-xs overflow-x-auto m-0">
                  {JSON.stringify({ ...reg, designHash: buildProjectMessage(DEMO_DESIGNS[i]).designHash }, null, 2)}
                </pre>
              </div>
            </details>
          </Card>
        );
      })}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Conservative IPCC bounds">
        <p className="text-sm text-base-content/70 m-0">
          IPCC 2006 Vol. 2 Ch. 1 defaults, 95% interval. The baseline (TOOL07) takes the lower bound, project emissions
          (TOOL03) the upper bound, so neither side can inflate credits.
        </p>
        <table className="table table-xs">
          <thead>
            <tr>
              <th>Fuel</th>
              <th className="text-right">NCV GJ/t (low / high)</th>
              <th className="text-right">CO₂ kg/TJ (low / high)</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(FUELS).map(fuel => (
              <tr key={fuel.label}>
                <td>{fuel.label}</td>
                <td className="text-right font-mono">
                  {fuel.ncv[1]} / {fuel.ncv[2]}
                </td>
                <td className="text-right font-mono">
                  {fuel.co2[1].toLocaleString()} / {fuel.co2[2].toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="What the contract enforces on its own">
        <ul className="text-sm m-0 pl-4 list-disc flex flex-col gap-1">
          <li>Power density rule at registration (PD ≤ 4 W/m² reverts) and the PE_HP rate that follows from it.</li>
          <li>Baseline fields per project type, grid EF range, crediting span of exactly 5, 7 or 10 × 365 days.</li>
          <li>Periods inside the crediting period, inside one crediting year, never overlapping.</li>
          <li>Gross generation within nameplate × duration; net export never above gross.</li>
          <li>VMR0017 plants: at most 15 MW; EF_Res and EF_embodied fixed by the registered methodology.</li>
          <li>
            BE, PE_HP, PE_FF, LE and ER recomputed from monitored inputs; credits minted from the carried balance.
          </li>
          <li>
            A per-plant sequence number, so a report computed against a stale ledger cannot be attested (
            <code>StaleLedger</code>).
          </li>
        </ul>
        <p className="text-sm text-base-content/70 m-0">
          Not implemented: VT0011&apos;s annual build-margin update, TOOL07 option B, dispatch-data and ex-post OM,
          off-grid plants and imports, integrated hydro projects, battery and pumped storage, geothermal sources. The
          LDC and VT0008 conditions are checked at design assessment from recorded evidence; a VVB validates the design
          and the additionality, and this is a digital implementation of the equations, not a certification.
        </p>
      </Card>
    </div>
  </div>
);

export default MethodologyPage;
