import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import scaffoldConfig, { walletConnectEnabled } from "~~/scaffold.config";

// The shared scaffold project id is on HashPack's malicious-dapp list. Until this deployment sets its own
// NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID, offer only the injected browser wallet (MetaMask). That path never
// opens WalletConnect, so HashPack's blacklist screen does not appear.
const wallets = walletConnectEnabled ? [metaMaskWallet, walletConnectWallet] : [injectedWallet];

const DEV_CHAIN_IDS = new Set<number>([chains.hardhat.id, chains.foundry.id]);

// The burner keeps a raw private key in localStorage, and the same key signs on every chain, mainnet included. Offer
// it only when the app's default network is a local chain, never on a deployment that targets Hedera.
const hasDevNetwork = DEV_CHAIN_IDS.has(scaffoldConfig.targetNetworks[0].id);

export const wagmiConnectors = () => {
  if (typeof window === "undefined") {
    return [];
  }

  const walletGroups = [
    {
      groupName: "Supported Wallets",
      wallets,
    },
  ];

  if (scaffoldConfig.enableBurnerWallet && hasDevNetwork) {
    walletGroups.push({
      groupName: "Development",
      wallets: [rainbowkitBurnerWallet],
    });
  }

  return connectorsForWallets(walletGroups, {
    appName: "Hydro dMRV",
    appDescription: "Hydropower carbon credits on Hedera testnet. A demo, not a carbon registry.",
    appUrl: window.location.origin,
    appIcon: `${window.location.origin}/favicon.png`,
    // Ignored by the injected wallet. A real id is required only when WalletConnect is enabled.
    projectId: walletConnectEnabled ? scaffoldConfig.walletConnectProjectId : "hydro-dmrv-injected-only",
  });
};
