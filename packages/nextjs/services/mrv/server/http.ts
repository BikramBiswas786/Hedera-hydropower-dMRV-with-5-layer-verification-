import { NextResponse } from "next/server";
import { AttestError } from "./attest";
import { RegistryNotDeployedError } from "./registry";
import { z } from "zod";

export class BadRequestError extends Error {}

export async function parseJsonBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BadRequestError("Request body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestError(z.prettifyError(parsed.error));
  return parsed.data;
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof BadRequestError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof AttestError) return NextResponse.json({ error: error.message }, { status: error.httpStatus });
  if (error instanceof RegistryNotDeployedError) return NextResponse.json({ error: error.message }, { status: 503 });
  console.error("[mrv api]", error);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

export function intParam(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new BadRequestError(`Expected a non-negative integer, got ${value}`);
  return Math.min(parsed, max);
}
