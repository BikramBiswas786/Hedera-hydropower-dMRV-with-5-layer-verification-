import type { HardhatRuntimeEnvironment } from "hardhat/types";

export type HydroNetworkConfig = {
  /** Chainlink HBAR/USD feed. `undefined` means deploy MockV3Aggregator (local chains only). */
  hbarUsdFeed?: string;
  /** What `msg.value` counts in: tinybar (1e8) on Hedera, wei (1e18) on a local Hardhat EVM. */
  nativeUnitsPerHbar: bigint;
  /** Oracle answers older than this cannot be used for settlement. Tune to the feed heartbeat. */
  maxPriceAgeSeconds: number;
  hashscanNetwork?: "testnet" | "mainnet";
};

// Chainlink Data Feeds on Hedera: https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera
const CHAINLINK_HBAR_USD = {
  hederaTestnet: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
  hederaMainnet: "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5",
} as const;

const TINYBAR_PER_HBAR = 10n ** 8n;
const WEI_PER_ETH = 10n ** 18n;
const DAY_PLUS_GRACE = 25 * 60 * 60;

export const MIN_TRUST_SCORE_BPS = 9_000;
export const LOCAL_MOCK_HBAR_USD = 25_000_000n; // $0.25, 8 decimals

export function getHydroNetworkConfig(hre: HardhatRuntimeEnvironment): HydroNetworkConfig {
  const maxPriceAgeSeconds = Number(process.env.MAX_PRICE_AGE_SECONDS ?? DAY_PLUS_GRACE);

  switch (hre.network.name) {
    case "hederaTestnet":
      return {
        hbarUsdFeed: CHAINLINK_HBAR_USD.hederaTestnet,
        nativeUnitsPerHbar: TINYBAR_PER_HBAR,
        maxPriceAgeSeconds,
        hashscanNetwork: "testnet",
      };
    case "hederaMainnet":
      return {
        hbarUsdFeed: CHAINLINK_HBAR_USD.hederaMainnet,
        nativeUnitsPerHbar: TINYBAR_PER_HBAR,
        maxPriceAgeSeconds,
        hashscanNetwork: "mainnet",
      };
    default:
      return { nativeUnitsPerHbar: WEI_PER_ETH, maxPriceAgeSeconds };
  }
}

export function hashscanTx(config: HydroNetworkConfig, txHash: string): string {
  return config.hashscanNetwork ? `https://hashscan.io/${config.hashscanNetwork}/transaction/${txHash}` : txHash;
}

export function hashscanContract(config: HydroNetworkConfig, address: string): string {
  return config.hashscanNetwork ? `https://hashscan.io/${config.hashscanNetwork}/contract/${address}` : address;
}
