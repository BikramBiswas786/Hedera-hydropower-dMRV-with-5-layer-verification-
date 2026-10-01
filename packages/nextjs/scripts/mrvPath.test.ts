import {
  LOCAL_ALREADY_ISSUED,
  missingOperatorMessage,
  missingTestnetMeterMessage,
  plantNotOnChainMessage,
} from "./mrv";
import { describe, expect, it } from "vitest";

describe("the testnet commands a local demo user runs next", () => {
  it("says the local market is already issued, and names the testnet meter command", () => {
    const message = missingTestnetMeterMessage("HYDRO-DEMO-01");
    expect(message).toContain("METER_PRIVATE_KEYS");
    expect(message).toContain(LOCAL_ALREADY_ISSUED);
    expect(message).toContain("yarn hardhat:meter-keys --network hederaTestnet");
    expect(message).not.toContain("yarn deploy` first");
  });

  it("does not tell them to run yarn deploy with no network", () => {
    const message = plantNotOnChainMessage("HYDRO-DEMO-01", 296);
    expect(message).toContain("chain 296");
    expect(message).toContain("yarn deploy --network hederaTestnet");
    expect(message).toContain("yarn deploy with no network exits");
    expect(message).toContain(LOCAL_ALREADY_ISSUED);
  });

  it("says an operator key is not required for verify or demo", () => {
    expect(missingOperatorMessage()).toContain("HEDERA_OPERATOR_ID");
    expect(missingOperatorMessage()).toContain("yarn verify");
  });
});
