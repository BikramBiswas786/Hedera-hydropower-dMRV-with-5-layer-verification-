import { BaseError, ContractFunctionRevertedError } from "viem";

/** An error whose message is safe to show to API and MCP callers, with the HTTP status it maps to. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
  }
}

/** The contract's custom error name for a revert, or viem's short message otherwise. */
export function revertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.shortMessage;
    return error.shortMessage;
  }
  return (error as Error).message;
}
