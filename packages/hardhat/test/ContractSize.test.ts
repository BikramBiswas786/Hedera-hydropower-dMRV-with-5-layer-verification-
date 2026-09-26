import { expect } from "chai";
import { contractSizes } from "../scripts/checkContractSizes";

/** The CI guard (`yarn hardhat:size`) fails above this; it is 512 B under Hedera's EIP-170 limit of 24,576 B. */
const SIZE_FAIL_BYTES = 24_064;

describe("contract size", () => {
  const sizes = contractSizes();

  for (const name of ["DmrvRegistry", "CreditMarket", "HydroVmr0017Module", "ResilientHbarUsdFeed"]) {
    it(`${name} stays under the ${SIZE_FAIL_BYTES.toLocaleString("en-US")} B guard`, () => {
      const entry = sizes.find(s => s.name === name);
      expect(entry, `${name} artifact`).to.not.equal(undefined);
      expect(entry!.bytes).to.be.at.most(SIZE_FAIL_BYTES);
    });
  }

  it("the guard covers every deployable contract outside mocks/ and legacy/", () => {
    expect(sizes.map(s => s.source).some(s => s.includes("/mocks/") || s.includes("/legacy/"))).to.equal(false);
    for (const { name, bytes } of sizes) expect(bytes, name).to.be.at.most(SIZE_FAIL_BYTES);
  });
});
