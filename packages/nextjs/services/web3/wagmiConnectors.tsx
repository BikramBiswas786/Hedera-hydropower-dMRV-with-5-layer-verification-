import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";

const wallets = [metaMaskWallet, walletConnectWallet];

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
    appName: "scaffold-hbar",
    projectId: scaffoldConfig.walletConnectProjectId,
  });
};
