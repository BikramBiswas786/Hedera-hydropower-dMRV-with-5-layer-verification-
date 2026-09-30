import { contractsForRuntime } from "./withLocal";
import { describe, expect, it } from "vitest";

describe("contractsForRuntime", () => {
  const committed = { 296: { CreditMarket: { address: "0xabc" } } };
  const local = { 31337: { CreditMarket: { address: "0xdef" } } };

  it("ignores a local deploy during tests and production builds", () => {
    expect(contractsForRuntime(committed, local, "test")).toEqual(committed);
    expect(contractsForRuntime(committed, local, "production")).toEqual(committed);
    expect(contractsForRuntime(committed, local, undefined)).toEqual(committed);
  });

  it("merges the local chain only for the dev server", () => {
    expect(contractsForRuntime(committed, local, "development")).toEqual({ ...committed, ...local });
  });
});
