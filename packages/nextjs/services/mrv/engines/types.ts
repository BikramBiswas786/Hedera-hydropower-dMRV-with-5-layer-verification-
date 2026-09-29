/**
 * What every methodology engine plugs into. An engine verifies one monitoring period for one family of projects and
 * reports it the way the methodology's own monitoring section is written: each data/parameter with its value, source,
 * frequency, the QA/QC applied and the clause that asks for it, and each finding with the clause it enforces.
 *
 * The registry side is the same shape: one `IMethodology` contract per methodology, one engine per methodology here,
 * and `DmrvRegistry`, the market and the HCS audit trail unchanged. See AGENTS.md, "Recipe: add a methodology".
 */

export type Severity = "info" | "review" | "reject";
export type Decision = "APPROVED" | "FLAGGED" | "REJECTED";

/** One QA/QC or applicability finding and the clause it enforces. */
export type Finding = {
  stage: string;
  /** Index into the submitted readings, or `null` for period-level findings. */
  reading: number | null;
  severity: Severity;
  message: string;
  /** Methodology, tool or programme clause, e.g. "VMR0017 §9.2". */
  clause: string;
};

/**
 * One row of the methodology's data and parameters tables:
 *   validation  fixed when the project was validated (ACM0002 §5.10, VMR0017 §9.1)
 *   monitored   measured during the period (ACM0002 §6.1, VMR0017 §9.2)
 *   calculated  derived by an equation from the rows above
 */
export type MonitoringParameter = {
  symbol: string;
  description: string;
  unit: string;
  /** `null` when the parameter does not apply to this project (the reason is in `source`). */
  value: number | string | null;
  kind: "validation" | "monitored" | "calculated";
  source: string;
  frequency?: string;
  /** What this engine did to the data, in the methodology's own QA/QC terms. */
  qaqc?: string;
  equation?: string;
  clause: string;
};

export type MonitoringReport = {
  /** The methodology as applied, e.g. "VMR0017 v1.0 with ACM0002 v22.0". */
  methodology: string;
  /** Every document whose clauses the parameters cite. */
  documents: string[];
  parameters: MonitoringParameter[];
  /** Parts of the methodology this project does not use, and why (a BESS term for a plant without one). */
  notApplied: { symbol: string; clause: string; reason: string }[];
};

/** What an engine returns, whatever the methodology. */
export type EngineReport = {
  engine: string;
  methodology: string;
  decision: Decision;
  reasoning: string;
  stages: { stage: string; title: string; status: "PASS" | "REVIEW" | "FAIL"; clause: string; summary: string }[];
  findings: Finding[];
  /** Emission reductions in grams CO2e, `null` when the period cannot be quantified. */
  reductionG: number | null;
  unitsMinted: number | null;
  monitoring: MonitoringReport;
};

/** A plug-in methodology engine: its own input, its own rules, the common report. */
export type MethodologyEngine<Input> = {
  /** Stable id used by `/api/mrv/engines/{id}/verify` and the MCP tool. */
  id: string;
  title: string;
  /** The methodology and tool versions it implements. */
  documents: string[];
  /** Project types it covers, in the methodology's words. */
  scope: string;
  /** The `IMethodology` contract that recomputes its quantities on-chain. */
  contract: string;
  /** zod schema of the verification input; `unknown` in, typed out. */
  parse(input: unknown): Input;
  verify(input: Input): EngineReport;
  /** A ready-to-verify input, for the docs, the MCP tool and tests. */
  example(end: Date): Input;
};

/** Summarises findings into a decision the same way for every engine: any reject rejects, any review flags. */
export function decide(findings: Finding[], acceptedShare: string): { decision: Decision; reasoning: string } {
  const rejects = findings.filter(f => f.severity === "reject");
  if (rejects.length) {
    return { decision: "REJECTED", reasoning: [...new Set(rejects.map(f => `${f.message} (${f.clause})`))].join("; ") };
  }
  const reviews = findings.filter(f => f.severity === "review");
  if (reviews.length) {
    return {
      decision: "FLAGGED",
      reasoning: `${reviews.length} finding(s) need a verifier's review; quantities already exclude unsupported data`,
    };
  }
  return { decision: "APPROVED", reasoning: `All checks passed with ${acceptedShare} data coverage` };
}

export function stageStatus(findings: Finding[], stage: string): "PASS" | "REVIEW" | "FAIL" {
  const own = findings.filter(f => f.stage === stage);
  if (own.some(f => f.severity === "reject")) return "FAIL";
  if (own.some(f => f.severity === "review")) return "REVIEW";
  return "PASS";
}
