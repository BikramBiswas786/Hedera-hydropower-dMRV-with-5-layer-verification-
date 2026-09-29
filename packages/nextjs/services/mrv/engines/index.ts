import { hydroEngine } from "./hydro";
import { renewableEngine } from "./renewable";
import type { EngineReport, MethodologyEngine } from "./types";

/**
 * Every methodology engine this deployment offers. Adding a methodology is one entry here plus its `IMethodology`
 * contract (AGENTS.md, "Recipe: add a methodology"); the REST routes, the MCP tools and the report UI read this list.
 */
export const ENGINES = [hydroEngine, renewableEngine] as const satisfies readonly MethodologyEngine<unknown>[];

export type EngineId = (typeof ENGINES)[number]["id"];

export function findEngine(id: string) {
  return ENGINES.find(engine => engine.id === id) ?? null;
}

/** What `GET /api/mrv/engines` and `list_methodology_engines` describe: no functions, just the catalogue. */
export function describeEngines() {
  return ENGINES.map(({ id, title, documents, scope, contract }) => ({ id, title, documents, scope, contract }));
}

/** Parses `input` with the engine's own schema and verifies it. Throws the schema's error on bad input. */
export function verifyWithEngine(id: string, input: unknown): EngineReport | null {
  const engine = findEngine(id);
  if (!engine) return null;
  const parsed: unknown = engine.parse(input);
  return (engine as MethodologyEngine<unknown>).verify(parsed);
}

export type { EngineReport, MethodologyEngine, MonitoringParameter, MonitoringReport } from "./types";
