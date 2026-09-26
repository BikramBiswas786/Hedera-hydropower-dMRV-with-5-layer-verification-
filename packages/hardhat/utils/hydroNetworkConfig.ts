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
  /** Whether settlement enforces the check. Stored but not enforced while false. */
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

// SaucerSwap. Contract ids: https://docs.saucerswap.finance/developers/contracts . Interfaces:
// V1 pair getReserves/token0/token1, github.com/saucerswaplabs/saucerswaplabs-core contracts/interfaces/IUniswapV2Pair.sol;
// V2 pool slot0/liquidity, github.com/saucerswaplabs/saucerswaplabs-v2-core contracts/interfaces/pool/IUniswapV3PoolState.sol.
// Pool addresses were read on 26 Sep 2026 with eth_call on the factories: testnet V2 factory 0.0.1197038
// getPool(USDC 0.0.5449, WHBAR 0.0.15058, 3000) and mainnet V2 factory 0.0.3946833 getPool(USDC 0.0.456858,
// WHBAR 0.0.1456986, 1500). In both pools token0 is USDC, so WHBAR is token1.
export const POOL_GUARDS: Record<"hederaTestnet" | "hederaMainnet", PoolGuardConfig> = {
  hederaTestnet: {
    pool: "0x914B98992d7eD602D1f5d9084ECe8160Fc0e741a",
    isV2: true,
    whbar: "0x0000000000000000000000000000000000003aD2",
    whbarDecimals: 8,
    usdDecimals: 6,
    maxDeviationBps: 300,
    minLiquidity: 0n,
    // The contract refuses setPoolGuard(..., false). Pointing this deploy at the testnet pool enforces it.
    // On 26 Sep 2026 that pool priced HBAR near $2 against an oracle near $0.09, so every testnet sale reverts
    // until the pool is within 3%. That is the point of the check. The market already on testnet predates it.
    enabled: true,
    note: "enforced. The 26 Sep 2026 testnet pool was near $2, so sales revert until it is within 3% of the oracle",
  },
  hederaMainnet: {
    pool: "0xC5B707348dA504E9Be1bD4E21525459830e7B11d",
    isV2: true,
    whbar: "0x0000000000000000000000000000000000163B5a",
    whbarDecimals: 8,
    usdDecimals: 6,
    maxDeviationBps: 300,
    minLiquidity: 0n,
    enabled: true,
    note: "mainnet pool tracked the oracle price (about $0.094) on 26 Sep 2026; the contract will not sell without it",
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
        poolGuard: POOL_GUARDS.hederaTestnet,
      };
    case "hederaMainnet":
      return {
        oracles: ORACLES.hederaMainnet,
        nativeUnitsPerHbar: TINYBAR_PER_HBAR,
        maxPriceAgeSeconds,
        hashscanNetwork: "mainnet",
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
