import { hashPackProvider, hashPackWallet, keplrProvider, keplrWallet } from "./hederaWallets";
import { afterEach, describe, expect, it, vi } from "vitest";

// RainbowKit pulls @vanilla-extract, which Vitest cannot import as ESM. The wallet
// objects only need the connector factories, so the real packages stay out of this file.
vi.mock("@rainbow-me/rainbowkit", () => ({
  getWalletConnectConnector: () => () => ({ id: "walletConnect" }),
}));
vi.mock("wagmi", () => ({
  createConnector: (factory: (config: unknown) => unknown) => factory,
}));
vi.mock("wagmi/connectors", () => ({
  injected: () => () => ({ id: "injected" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hedera wallets", () => {
  it("offers HashPack and Keplr by WalletConnect when neither extension is injected", () => {
    const hashpack = hashPackWallet({ projectId: "test-project" });
    const keplr = keplrWallet({ projectId: "test-project" });
    expect(hashpack.name).toBe("HashPack");
    expect(keplr.name).toBe("Keplr");
    expect(hashpack.qrCode?.getUri("wc:abc")).toBe("wc:abc");
    expect(keplr.qrCode?.getUri("wc:abc")).toBe("wc:abc");
    expect(hashPackProvider()).toBeUndefined();
    expect(keplrProvider()).toBeUndefined();
  });

  it("uses the injected provider and does not open a QR", () => {
    const request = async () => [];
    vi.stubGlobal("window", {
      hashpack: { ethereum: { request } },
      keplr: { ethereum: { request } },
    });
    expect(hashPackProvider()?.request).toBe(request);
    expect(keplrProvider()?.request).toBe(request);
    expect(hashPackWallet({ projectId: "test-project" }).qrCode).toBeUndefined();
    expect(keplrWallet({ projectId: "test-project" }).installed).toBe(true);
  });
});
