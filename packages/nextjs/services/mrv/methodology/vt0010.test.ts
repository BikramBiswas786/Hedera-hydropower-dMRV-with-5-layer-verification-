import { projectElectricityG } from "./vt0010";
import { describe, expect, it } from "vitest";

describe("VT0010 project electricity consumption", () => {
  it("applies the 20% default transmission loss and rounds up", () => {
    // 1 MWh at 0.5 t/MWh with TDL 20% is 0.6 t = 600 000 g.
    expect(projectElectricityG(1_000_000n, 500_000n)).toBe(600_000n);
    // 1 Wh at 1 g/MWh does not divide evenly once the loss is applied, so it rounds up.
    expect(projectElectricityG(1n, 1n, 2_000n)).toBe(1n);
  });

  it("is the netted import when transmission losses are zero", () => {
    expect(projectElectricityG(2_000_000n, 573_000n, 0n)).toBe((2_000_000n * 573_000n) / 1_000_000n);
  });
});
