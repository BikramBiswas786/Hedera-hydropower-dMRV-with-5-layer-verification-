import type { ReactNode } from "react";
import Link from "next/link";
import { VerificationPanel } from "./VerificationPanel";
import { ExternalLink, StatCard, formatPeriod } from "~~/components/hydro/ui";
import type { PlantDetail } from "~~/services/mrv/server/insights";
import { formatGramsAsTonnes, formatTonnes, formatWhAsMwh } from "~~/services/mrv/views";

const date = (seconds: number) => new Date(seconds * 1_000).toISOString().slice(0, 10);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <tr>
    <th className="font-medium text-base-content/70 whitespace-nowrap">{label}</th>
    <td>{children}</td>
  </tr>
);

export const PlantDetailView = ({ detail }: { detail: PlantDetail }) => {
  const { plant, totals, attestations, issuances } = detail;
  const { design, ledger } = plant;
  const peTotal = totals.reservoirG + totals.fossilFuelG;
  const leTotal = attestations.reduce((sum, a) => sum + a.leakageG, 0);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/plants" className="link text-sm">
          ← All plants
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base-content/60">{plant.plantId}</span>
          <span className="badge badge-outline">{detail.methodology}</span>
          <span className="badge badge-outline">{detail.projectType}</span>
          <span className={`badge ${plant.active ? "badge-success" : "badge-warning"}`}>
            {plant.active ? "active" : "inactive"}
          </span>
        </div>
        <h1 className="text-3xl font-bold m-0">{plant.name}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          <ExternalLink href={detail.links.designDocument}>Design document</ExternalLink>
          {detail.links.registry && <ExternalLink href={detail.links.registry}>Registry contract</ExternalLink>}
          <Link href="/audit" className="link link-primary">
            Audit every record
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Credits issued"
          value={`${formatTonnes(plant.issuedUnits)} t CO₂e`}
          hint={
            totals.pendingRecords > 0
              ? `${formatGramsAsTonnes(totals.pendingReductionG)} t in ${totals.pendingRecords} record${totals.pendingRecords === 1 ? "" : "s"} awaiting a VVB`
              : "every record verified"
          }
        />
        <StatCard
          label="Monitored emission reductions"
          value={`${formatGramsAsTonnes(totals.reductionG)} t`}
          hint={`BE ${formatGramsAsTonnes(totals.baselineG)} − PE ${formatGramsAsTonnes(peTotal)} − LE ${formatGramsAsTonnes(leTotal)} t`}
        />
        <StatCard
          label="Net export"
          value={`${formatWhAsMwh(totals.netWh)} MWh`}
          hint={totals.creditsPerMwh === null ? undefined : `${totals.creditsPerMwh.toFixed(3)} t CO₂e per MWh`}
        />
        <StatCard
          label="Data coverage"
          value={totals.completenessBps === null ? "—" : `${(totals.completenessBps / 100).toFixed(1)}%`}
          hint={`${totals.attestations} monitored period${totals.attestations === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
          <h2 className="text-lg font-semibold mt-0">Registered design</h2>
          <table className="table table-sm">
            <tbody>
              <Row label="Host country">{design.hostCountry || "not stated"}</Row>
              <Row label="Capacity">
                {(design.capacityKw / 1_000).toLocaleString()} MW
                {design.authorizedCapacityKw > 0 &&
                  ` (authorized ${(design.authorizedCapacityKw / 1_000).toLocaleString()} MW)`}
                {design.baselineCapacityKw > 0 &&
                  ` (baseline ${(design.baselineCapacityKw / 1_000).toLocaleString()} MW)`}
              </Row>
              <Row label="Reservoir">
                {design.reservoirAreaM2 > 0
                  ? `${(design.reservoirAreaM2 / 1e6).toLocaleString()} km² · PD ${detail.powerDensity.wPerM2?.toFixed(2) ?? "—"} W/m²`
                  : "run-of-river (no reservoir)"}
              </Row>
              <Row label="Reservoir emissions">{detail.powerDensity.basis}</Row>
              <Row label={design.methodology === 1 ? "EF_grid,CM (VT0011)" : "EF_grid,CM (TOOL07)"}>
                {(design.efGridGPerMwh / 1e6).toFixed(6)} t CO₂/MWh
              </Row>
              <Row label="Fuel COEF (TOOL03)">
                {design.fuelCoefGPerTonne ? `${(design.fuelCoefGPerTonne / 1e6).toFixed(4)} t CO₂/t fuel` : "none"}
              </Row>
              {design.baselineWh > 0 && (
                <Row label="Baseline">
                  EG_historical + σ = {formatWhAsMwh(design.baselineWh)} MWh/yr until {date(design.baselineEndsAt)}
                </Row>
              )}
              <Row label="Crediting period">
                {plant.creditingPeriods > 1 ? `#${plant.creditingPeriods}: ` : ""}
                {date(design.creditingStart)} → {date(design.creditingEnd)}
              </Row>
              <Row label="Validated by (VVB)">
                <span className="font-mono text-xs break-all">{plant.validator}</span>
              </Row>
              <Row label="Validation report">
                <span className="font-mono text-xs break-all">{plant.validationReportHash}</span>
              </Row>
              {plant.externalId && (
                <Row label="External program id">
                  <span className="font-mono text-xs break-all">{plant.externalId}</span>
                </Row>
              )}
              <Row label="Design hash">
                <span className="font-mono text-xs break-all">{plant.designHash}</span>
              </Row>
            </tbody>
          </table>
        </section>

        <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
          <h2 className="text-lg font-semibold mt-0">On-chain ledger</h2>
          <table className="table table-sm">
            <tbody>
              <Row label="Monitoring records">
                {ledger.attestations} ({plant.verifiedRecords} verified)
              </Row>
              <Row label="Crediting year">{ledger.creditingYear + 1}</Row>
              <Row label="Net energy this year">{formatWhAsMwh(ledger.yearNetWh)} MWh</Row>
              <Row label="Unissued balance">
                {plant.unissuedBalanceG >= 0
                  ? `${plant.unissuedBalanceG.toLocaleString()} g CO₂e verified, carried toward the next kg credit`
                  : `${(-plant.unissuedBalanceG).toLocaleString()} g CO₂e verified deficit, netted against the next issuance`}
              </Row>
              <Row label="Record chain head">
                <span className="font-mono text-xs break-all">{plant.recordsHash}</span>
              </Row>
              <Row label="Last period ends">
                {plant.lastPeriodEnd
                  ? new Date(plant.lastPeriodEnd * 1_000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
                  : "—"}
              </Row>
              <Row label="Operator">
                <span className="font-mono text-xs break-all">{plant.operator}</span>
              </Row>
            </tbody>
          </table>
          <p className="text-xs text-base-content/60 m-0">
            The next record must start after the last period and carries this ledger&apos;s sequence number, so a stale
            or replayed meter statement is refused on-chain. A VVB verification must sign the chain head of the records
            it covers.
          </p>
        </section>
      </div>

      <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mt-0">Monitoring records</h2>
        {attestations.length === 0 ? (
          <p className="m-0 text-base-content/60">
            Nothing recorded yet. Verify a period on{" "}
            <Link href="/verify" className="link">
              /verify
            </Link>{" "}
            or run <code>yarn mrv:record</code>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Period</th>
                  <th className="text-right">EG_facility</th>
                  <th className="text-right">BE</th>
                  <th className="text-right">PE</th>
                  <th className="text-right">LE</th>
                  <th className="text-right">ER</th>
                  <th>Status</th>
                  <th className="text-right">Coverage</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {[...attestations].reverse().map(a => (
                  <tr key={a.id}>
                    <td className="font-mono">{a.sequence}</td>
                    <td className="whitespace-nowrap text-xs">{formatPeriod(a.periodStart, a.periodEnd)}</td>
                    <td className="text-right whitespace-nowrap">{formatWhAsMwh(a.netEnergyWh)} MWh</td>
                    <td className="text-right">{formatGramsAsTonnes(a.baselineG)} t</td>
                    <td className="text-right">{formatGramsAsTonnes(a.reservoirG + a.fossilFuelG)} t</td>
                    <td className="text-right">{formatGramsAsTonnes(a.leakageG)} t</td>
                    <td className="text-right font-semibold">{formatGramsAsTonnes(a.reductionG)} t</td>
                    <td className="whitespace-nowrap text-xs">
                      {a.status === "monitored" ? "awaiting VVB" : a.status === "issued" ? "verified" : "rejected"}
                      {a.issuanceId !== null && ` (#${a.issuanceId})`}
                    </td>
                    <td className="text-right">{(a.completenessBps / 100).toFixed(1)}%</td>
                    <td className="whitespace-nowrap text-xs flex gap-3">
                      {a.reportUrl && <ExternalLink href={a.reportUrl}>HCS report</ExternalLink>}
                      <ExternalLink href={a.auditUrl}>Reproduce</ExternalLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="text-lg font-semibold mt-0">Verifications</h2>
        {issuances.length === 0 ? (
          <p className="m-0 text-base-content/60">
            No VVB has verified these records yet, so no credits exist for them.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Records</th>
                  <th>Decision</th>
                  <th className="text-right">Monitored ER</th>
                  <th className="text-right">Deduction</th>
                  <th className="text-right">Issued</th>
                  <th>VVB</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {[...issuances].reverse().map(i => (
                  <tr key={i.id}>
                    <td className="font-mono">{i.id}</td>
                    <td>
                      {i.firstRecord}–{i.lastRecord}
                    </td>
                    <td>{i.decision === 1 ? "approved" : "rejected"}</td>
                    <td className="text-right">{formatGramsAsTonnes(i.monitoredG)} t</td>
                    <td className="text-right">{formatGramsAsTonnes(i.deductionG)} t</td>
                    <td className="text-right font-semibold">{formatTonnes(i.unitsIssued)} t</td>
                    <td className="font-mono text-xs">{i.verifier}</td>
                    <td className="text-xs">
                      {i.reportUrl && <ExternalLink href={i.reportUrl}>HCS report</ExternalLink>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <VerificationPanel plantId={plant.plantId} />
    </>
  );
};
