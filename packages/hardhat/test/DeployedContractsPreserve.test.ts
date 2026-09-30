import { expect } from "chai";
import * as fs from "fs";
import { contractFileBody, hasTopLevelChain } from "../scripts/generateTsAbis";

const committed = fs.readFileSync("../nextjs/contracts/deployedContracts.ts", "utf8");

describe("deployedContracts.ts", function () {
  it("does not write a localhost deploy into the committed file", function () {
    const { body, kept } = contractFileBody(
      { "31337": { CreditMarket: { address: "0x0000000000000000000000000000000000000001", abi: [] } } },
      committed,
    );
    expect(kept).to.deep.equal(["296"]);
    expect(body).to.not.include("31337:");
    expect(body).to.not.include("0x0000000000000000000000000000000000000001");
    expect(body).to.include("0x48F5056EdaD0B16c97a54085512b48417bC40F04");
    expect(body).to.include("296:");
    expect(hasTopLevelChain(committed, "31337")).to.equal(false);
  });

  it("drops a local chain that an older deploy wrote into the committed file", function () {
    const dirty = committed.replace(
      "const deployedContracts = {",
      'const deployedContracts = {\n  31337: { CreditMarket: { address: "0x0000000000000000000000000000000000000001", abi: [] } },',
    );
    const { body, kept } = contractFileBody(
      { "31337": { CreditMarket: { address: "0x0000000000000000000000000000000000000003", abi: [] } } },
      dirty,
    );
    expect(hasTopLevelChain(dirty, "31337")).to.equal(true);
    expect(kept).to.deep.equal(["296"]);
    expect(body).to.not.include("31337:");
    expect(body).to.not.include("0x0000000000000000000000000000000000000001");
    expect(body).to.include("0x48F5056EdaD0B16c97a54085512b48417bC40F04");
  });

  it("lets a deployment folder replace that chain instead of keeping a second copy", function () {
    const { body, kept } = contractFileBody(
      { "296": { CreditMarket: { address: "0x0000000000000000000000000000000000000002", abi: [] } } },
      committed,
    );
    expect(kept).to.deep.equal([]);
    expect(body.match(/296:/g)).to.have.length(1);
    expect(body).to.include("0x0000000000000000000000000000000000000002");
    expect(body).to.not.include("0x48F5056EdaD0B16c97a54085512b48417bC40F04");
  });
});
