import { expect } from "chai";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ethers } from "hardhat";
import { demoMeterAddress, resolveMeterAddresses } from "../utils/meterKeys";
import { DEMO_PLANTS } from "../utils/demoPlants";

const IDS = DEMO_PLANTS.map(p => p.plantId);
const NO_FILE = join(tmpdir(), "does-not-exist.json");

describe("per-plant meter keys (deploy)", function () {
  it("uses the public demo derivation on local chains only", function () {
    const meters = resolveMeterAddresses("localhost", IDS, {}, NO_FILE);
    expect(meters["HYDRO-DEMO-01"]).to.equal(demoMeterAddress("HYDRO-DEMO-01"));
    expect(meters["HYDRO-DEMO-01"]).to.equal(DEMO_PLANTS[0].meter);
  });

  it("throws on Hedera networks when a plant has no meter", function () {
    for (const network of ["hederaTestnet", "hederaMainnet"]) {
      expect(() => resolveMeterAddresses(network, IDS, {}, NO_FILE)).to.throw(/No meter address/);
    }
  });

  it("throws on Hedera testnet when a configured meter is the demo derivation", function () {
    const env = { METER_ADDRESSES: JSON.stringify({ "HYDRO-DEMO-01": demoMeterAddress("HYDRO-DEMO-01") }) };
    expect(() => resolveMeterAddresses("hederaTestnet", ["HYDRO-DEMO-01"], env, NO_FILE)).to.throw(
      /Refusing the public demo meter/,
    );
  });

  it("reads METER_ADDRESSES first, then .secrets/meters.<network>.json", function () {
    const a = ethers.Wallet.createRandom().address;
    const b = ethers.Wallet.createRandom().address;
    const dir = mkdtempSync(join(tmpdir(), "meters-"));
    const file = join(dir, "meters.hederaTestnet.json");
    writeFileSync(file, JSON.stringify({ "HYDRO-DEMO-01": { address: b }, "HYDRO-DEMO-02": { address: b } }));
    const fromEnv = resolveMeterAddresses(
      "hederaTestnet",
      ["HYDRO-DEMO-01"],
      { METER_ADDRESSES: JSON.stringify({ "HYDRO-DEMO-01": a }) },
      file,
    );
    expect(fromEnv["HYDRO-DEMO-01"]).to.equal(a);
    const fromFile = resolveMeterAddresses("hederaTestnet", IDS, {}, file);
    expect(fromFile["HYDRO-DEMO-02"]).to.equal(b);
  });
});
