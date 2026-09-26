import { expect } from "chai";
import fs from "fs";
import path from "path";

/** Hedera rejects a contract creation whose deployed bytecode exceeds this. */
const HEDERA_MAX_CONTRACT_BYTES = 24_576;

describe("contract size", () => {
  it("HydroCreditRegistry stays deployable on Hedera", () => {
    const artifactPath = path.join(
      __dirname,
      "../artifacts/contracts/HydroCreditRegistry.sol/HydroCreditRegistry.json",
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as { deployedBytecode: string };
    const bytes = (artifact.deployedBytecode.length - 2) / 2;
    expect(bytes).to.be.at.most(HEDERA_MAX_CONTRACT_BYTES);
  });
});
