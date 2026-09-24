import { DEMO_PLANTS as REGISTERED } from "../../../hardhat/utils/demoPlants";
import { DEMO_ASSESSMENTS, DEMO_DESIGNS } from "./demo";
import { buildProjectMessage } from "./report";
import { describe, expect, it } from "vitest";

describe("demo plants registered by the deploy script", () => {
  it("match what the methodology engine derives from the demo designs", () => {
    expect(REGISTERED.map(p => p.plantId)).toEqual(DEMO_DESIGNS.map(d => d.plantId));
    DEMO_DESIGNS.forEach((design, i) => {
      const { designHash, ...integers } = REGISTERED[i].design;
      expect(REGISTERED[i].name).toBe(design.name);
      expect(integers).toEqual(DEMO_ASSESSMENTS[i].registration);
      expect(designHash).toBe(buildProjectMessage(design).designHash);
    });
  });
});
