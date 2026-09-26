import { encodeAdminCall } from "./adminExec";
import { THRESHOLD, thresholdKeyList } from "./createThresholdAdmin";
import { PrivateKey } from "@hiero-ledger/sdk";
import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

describe("threshold admin scripts", () => {
  it("builds a 2-of-3 key list and refuses anything else", () => {
    const keys = [0, 1, 2].map(() => PrivateKey.generateECDSA().publicKey.toString());
    const list = thresholdKeyList(keys);
    expect(list.threshold).toBe(THRESHOLD);
    expect(list.toArray()).toHaveLength(3);
    expect(() => thresholdKeyList(keys.slice(0, 2))).toThrow(/exactly three/);
    expect(() => thresholdKeyList([keys[0], keys[0], keys[1]])).toThrow(/distinct/);
  });

  it("encodes admin calls exactly like viem", () => {
    const abi = parseAbi(["function setPoolGuardEnabled(bool enabled)"]);
    expect(encodeAdminCall("setPoolGuardEnabled(bool)", ["false"])).toBe(
      encodeFunctionData({ abi, functionName: "setPoolGuardEnabled", args: [false] }),
    );
    expect(() => encodeAdminCall("setPoolGuardEnabled(bool)", [])).toThrow(/takes 1 arguments/);
  });
});
