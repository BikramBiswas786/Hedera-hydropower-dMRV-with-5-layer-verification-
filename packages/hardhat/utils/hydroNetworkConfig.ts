import type { HardhatRuntimeEnvironment } from "hardhat/types";

export type OracleSources = {
  /** Chainlink HBAR/USD aggregator (primary). */
  chainlink: string;
  /** Supra push oracle (fallback) and its HBAR/USDT pair index. */
  supra: string;
  supraPairId: number;
};

export type HydroNetworkConfig = {
  /** Live oracle addresses. `undefined` means deploy mocks (local chains only). */
  oracles?: OracleSources;
  /** What `msg.value` counts in: tinybar (1e8) on Hedera, wei (1e18) on a local Hardhat EVM. */
  nativeUnitsPerHbar: bigint;
  /** Oracle answers older than this cannot be used for settlement. Tune to the feed heartbeat. */
  maxPriceAgeSeconds: number;
  hashscanNetwork?: "testnet" | "mainnet";
};

// Chainlink: https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera
// Supra:     https://docs.supra.com/oracles/data-feeds/push-oracle/networks (pair 75 = HBAR/USDT)
const ORACLES: Record<"hederaTestnet" | "hederaMainnet", OracleSources> = {
  hederaTestnet: {
    chainlink: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
    supra: "0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917",
    supraPairId: 75,
  },
  hederaMainnet: {
    chainlink: "0xAF685FB45C12b92b5054ccb9313e135525F9b5d5",
    supra: "0xD02cc7a670047b6b012556A88e275c685d25e0c9",
    supraPairId: 75,
  },
};

const TINYBAR_PER_HBAR = 10n ** 8n;
const WEI_PER_ETH = 10n ** 18n;
const DAY_PLUS_GRACE = 25 * 60 * 60;

export const MIN_TRUST_SCORE_BPS = 9_000;
export const LOCAL_MOCK_HBAR_USD = 25_000_000n; // $0.25, 8 decimals
export const LOCAL_SUPRA_PAIR_ID = 75;

/** Fresh Chainlink and Supra answers must agree within this bound; 3% also absorbs USDT/USD basis. */
export const MAX_ORACLE_DEVIATION_BPS = Number(process.env.MAX_ORACLE_DEVIATION_BPS ?? 300);

export function getHydroNetworkConfig(hre: HardhatRuntimeEnvironment): HydroNetworkConfig {
  const maxPriceAgeSeconds = Number(process.env.MAX_PRICE_AGE_SECONDS ?? DAY_PLUS_GRACE);

  switch (hre.network.name) {
    case "hederaTestnet":
      return {
        oracles: ORACLES.hederaTestnet,
        nativeUnitsPerHbar: TINYBAR_PER_HBAR,
        maxPriceAgeSeconds,
        hashscanNetwork: "testnet",
      };
    case "hederaMainnet":
      return {
        oracles: ORACLES.hederaMainnet,
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
