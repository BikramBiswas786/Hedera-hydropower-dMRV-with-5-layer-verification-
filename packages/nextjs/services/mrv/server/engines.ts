import { describeEngines, findEngine, verifyWithEngine } from "../engines";
import { ApiError } from "./errors";
import { z } from "zod";

/** REST and MCP entry points for the methodology engine registry (`services/mrv/engines`). */

export const verifyWithEngineSchema = z.object({
  engine: z.string().min(1).describe("Engine id from list_methodology_engines, e.g. renewable-vmr0017"),
  input: z.unknown().describe("The engine's own verification input; get_methodology_engine returns an example"),
});

export function listEngines() {
  return { engines: describeEngines() };
}

/** One engine's description and a ready-to-verify example ending at the last whole hour. */
export function getEngine(id: string, now = new Date()) {
  const engine = findEngine(id);
  if (!engine)
    throw new ApiError(
      `No methodology engine "${id}". Known: ${describeEngines()
        .map(e => e.id)
        .join(", ")}`,
      404,
    );
  const { title, documents, scope, contract } = engine;
  return { id, title, documents, scope, contract, example: engine.example(now) };
}

export function runEngine(id: string, input: unknown) {
  const report = verifyWithEngine(id, input);
  if (!report) throw new ApiError(`No methodology engine "${id}"`, 404);
  return report;
}
