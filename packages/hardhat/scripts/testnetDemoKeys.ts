import { appendFileSync } from "fs";
import { DEMO_PLANTS } from "../utils/demoPlants";
import { testnetMeter, testnetVvb } from "../utils/testnetDemoKeys";

/**
 * CI only: writes the testnet demo keys derived from TESTNET_DEPLOYER_KEY to $GITHUB_ENV, masking every private key
 * in the log. METER_ADDRESSES and VERIFIER_ADDRESS are public; VALIDATOR_PRIVATE_KEY and METER_PRIVATE_KEYS are not.
 */
const deployerKey = process.env.TESTNET_DEPLOYER_KEY;
const envFile = process.env.GITHUB_ENV;
if (!deployerKey || !envFile) throw new Error("Needs TESTNET_DEPLOYER_KEY and GITHUB_ENV");

const meters = Object.fromEntries(DEMO_PLANTS.map(p => [p.plantId, testnetMeter(deployerKey, p.plantId)]));
const vvb = testnetVvb(deployerKey);
for (const wallet of [vvb, ...Object.values(meters)]) console.log(`::add-mask::${wallet.privateKey}`);
const addresses = Object.fromEntries(Object.entries(meters).map(([id, w]) => [id, w.address]));
const keys = Object.fromEntries(Object.entries(meters).map(([id, w]) => [id, w.privateKey]));
appendFileSync(
  envFile,
  [
    `METER_ADDRESSES=${JSON.stringify(addresses)}`,
    `METER_PRIVATE_KEYS=${JSON.stringify(keys)}`,
    `VALIDATOR_PRIVATE_KEY=${vvb.privateKey}`,
    `VERIFIER_ADDRESS=${vvb.address}`,
    "",
  ].join("\n"),
);
console.log(`Demo VVB ${vvb.address}; meters ${JSON.stringify(addresses)}`);
