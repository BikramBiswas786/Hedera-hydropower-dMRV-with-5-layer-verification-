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
  /** SaucerSwap factory. The market pins `pool.factory()` to this address. */
  saucerFactory?: string;
  /** SaucerSwap V1 router. A purchase swaps through it. */
  saucerRouter?: string;
  /** SaucerSwap WHBAR/USDC pool the market cross-checks the oracle against. `undefined` on local chains. */
  poolGuard?: PoolGuardConfig;
};

export type PoolGuardConfig = {
  /** Pool (V2) or pair (V1) EVM address. */
  pool: string;
  /** false: SaucerSwap V1 pair (`getReserves`); true: SaucerSwap V2 pool (`slot0`). */
  isV2: boolean;
  whbar: string;
  whbarDecimals: number;
  usdDecimals: number;
  maxDeviationBps: number;
  /** V1: minimum USD-side reserve in base units; V2: minimum in-range `liquidity()`. */
  minLiquidity: bigint;
  /** Must be true. `setPoolGuard` reverts when this is false. */
  enabled: boolean;
  /** Why the default is what it is (printed by the deploy). */
  note: string;
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

// SaucerSwap V1, the router this market calls. Ids: https://docs.saucerswap.finance/developers/contracts
// Testnet factory 0.0.9959, router 0.0.19264. Mainnet factory 0.0.1062784, router 0.0.3045981.
// The mainnet pair is factory.getPair(USDC 0.0.456858, WHBAR 0.0.1456986) = 0.0.1462797.
// On 26 Sep 2026 its spot was 9,481,356 and Chainlink was 9,503,637 (24 bps).
export const POOL_GUARDS: Record<"hederaTestnet" | "hederaMainnet", PoolGuardConfig> = {
  hederaTestnet: {
    pool: "0xF98D0dF4eC60d57f24Ce7BD24eAcAdF045219869",
    isV2: false,
    whbar: "0x0000000000000000000000000000000000003aD2",
    whbarDecimals: 8,
    usdDecimals: 6,
    maxDeviationBps: 300,
    minLiquidity: 1_000_000n,
    // Seeded 26 Sep 2026 on SaucerSwap V1 factory 0.0.9959 with 20 HBAR and QUSD 0.0.10729568.
    // Reserves imply exactly the Chainlink price (9_397_300 = $0.093973). The canonical V2 WHBAR/USDC
    // pool was near $2 that day, so it cannot be the guard.
    enabled: true,
    note: "SaucerSwap V1 pair seeded at the Chainlink price on 26 Sep 2026; enforced",
  },
  hederaMainnet: {
    pool: "0xdB34c1Ef944883f0e5A2fC18B6C1978B088bD31d",
    isV2: false,
    whbar: "0x0000000000000000000000000000000000163B5a",
    whbarDecimals: 8,
    usdDecimals: 6,
    maxDeviationBps: 300,
    minLiquidity: 1_000_000n,
    enabled: true,
    note: "SaucerSwap V1 WHBAR/USDC 0.0.1462797; 24 bps from Chainlink on 26 Sep 2026",
  },
};

const TINYBAR_PER_HBAR = 10n ** 8n;
const WEI_PER_ETH = 10n ** 18n;
const DAY_PLUS_GRACE = 25 * 60 * 60;

/** Share of a monitoring period that must be covered by accepted data (the engine flags anything lower). */
export const MIN_COMPLETENESS_BPS = 9_000;
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
        saucerFactory: "0x00000000000000000000000000000000000026e7", // V1 factory 0.0.9959
        saucerRouter: "0x0000000000000000000000000000000000004b40", // V1 router 0.0.19264
        poolGuard: POOL_GUARDS.hederaTestnet,
      };
    case "hederaMainnet":
      return {
        oracles: ORACLES.hederaMainnet,
        nativeUnitsPerHbar: TINYBAR_PER_HBAR,
        maxPriceAgeSeconds,
        hashscanNetwork: "mainnet",
        saucerFactory: "0x0000000000000000000000000000000000103780", // V1 factory 0.0.1062784
        saucerRouter: "0x00000000000000000000000000000000002e7a5d", // V1 router 0.0.3045981
        poolGuard: POOL_GUARDS.hederaMainnet,
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
