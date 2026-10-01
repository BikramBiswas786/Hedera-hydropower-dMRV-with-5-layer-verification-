import { demoEngineLines } from "./engineCheck";
import { describe, expect, it } from "vitest";

describe("yarn verify", () => {
  it("approves a healthy day and rejects inflated and tampered, and says why", () => {
    const lines = demoEngineLines();
    const byName = Object.fromEntries(lines.map(line => [line.name, line]));
    expect(byName.healthy.decision).toBe("APPROVED");
    expect(byName.healthy.ok).toBe(true);
    expect(byName.inflated.decision).toBe("REJECTED");
    expect(byName.inflated.reason.length).toBeGreaterThan(10);
    expect(byName.tampered.decision).toBe("REJECTED");
    expect(byName.tampered.reason.length).toBeGreaterThan(10);
    expect(lines.some(line => line.gated && !line.ok)).toBe(false);
  });
});
