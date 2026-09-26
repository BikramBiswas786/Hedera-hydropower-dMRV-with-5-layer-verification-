import { isAuthorized, writesEnabled } from "./config";
import { afterEach, describe, expect, it } from "vitest";

const PREV = process.env.MRV_API_KEY;

afterEach(() => {
  if (PREV === undefined) delete process.env.MRV_API_KEY;
  else process.env.MRV_API_KEY = PREV;
});

describe("MRV_API_KEY", () => {
  it("disables writes when the key is unset", () => {
    delete process.env.MRV_API_KEY;
    expect(writesEnabled()).toBe(false);
    expect(isAuthorized("Bearer anything")).toBe(false);
    expect(isAuthorized(null)).toBe(false);
  });

  it("rejects a missing, bare, or wrong bearer", () => {
    process.env.MRV_API_KEY = "operator-secret";
    expect(writesEnabled()).toBe(true);
    expect(isAuthorized(null)).toBe(false);
    expect(isAuthorized("operator-secret")).toBe(false);
    expect(isAuthorized("Bearer operator-secre")).toBe(false);
    expect(isAuthorized("Bearer operator-secret-extra")).toBe(false);
  });

  it("accepts only the exact bearer", () => {
    process.env.MRV_API_KEY = "operator-secret";
    expect(isAuthorized("Bearer operator-secret")).toBe(true);
  });
});
