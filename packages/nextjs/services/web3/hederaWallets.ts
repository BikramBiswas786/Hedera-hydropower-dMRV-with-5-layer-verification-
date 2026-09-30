import { type Wallet, getWalletConnectConnector } from "@rainbow-me/rainbowkit";
import { createConnector } from "wagmi";
import { injected } from "wagmi/connectors";

/**
 * MetaMask, HashPack and Keplr. HashPack is how most Hedera accounts connect. The extension is used when it
 * injects a provider, which never goes through WalletConnect's verify list. Otherwise the button is a
 * WalletConnect QR the wallet's own scanner can read. An ED25519 HashPack account cannot sign an EVM purchase.
 */

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type WalletArgs = {
  projectId: string;
  walletConnectParameters?: Parameters<typeof getWalletConnectConnector>[0]["walletConnectParameters"];
};

const HASHPACK_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#12141c"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#7ee0c6">H</text></svg>`,
  );

const KEPLR_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1c1233"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#c4b5fd">K</text></svg>`,
  );

function asProvider(value: unknown): Eip1193 | undefined {
  if (value && typeof value === "object" && "request" in value && typeof (value as Eip1193).request === "function") {
    return value as Eip1193;
  }
  return undefined;
}

/** HashPack's extension, or HashPack's in-app browser, when it injects an Ethereum provider. */
export function hashPackProvider(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & {
    hashpack?: { ethereum?: unknown; provider?: unknown; request?: unknown };
    ethereum?: Eip1193 & { isHashPack?: boolean; providers?: Array<Eip1193 & { isHashPack?: boolean }> };
  };
  return (
    asProvider(w.hashpack?.ethereum) ??
    asProvider(w.hashpack?.provider) ??
    asProvider(typeof w.hashpack?.request === "function" ? w.hashpack : undefined) ??
    (w.ethereum?.isHashPack ? asProvider(w.ethereum) : undefined) ??
    asProvider(w.ethereum?.providers?.find((provider: Eip1193 & { isHashPack?: boolean }) => provider.isHashPack))
  );
}

/** Keplr's EIP-1193 provider. Absent when only the Cosmos signer is injected. */
export function keplrProvider(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  const keplr = (window as Window & { keplr?: { ethereum?: unknown } }).keplr;
  return asProvider(keplr?.ethereum);
}

function fromProvider(id: string, name: string, provider: Eip1193): Wallet["createConnector"] {
  return walletDetails =>
    createConnector(config => ({
      ...injected({
        // This wagmi build types `target` as a known wallet id. The runtime also accepts a provider, which is
        // how RainbowKit connects an extension that is not MetaMask.
        target: () => ({ id, name, provider }),
      } as never)(config),
      ...walletDetails,
    }));
}

const downloads = {
  hashpack: {
    browserExtension: "https://www.hashpack.app/",
    chrome: "https://chromewebstore.google.com/detail/hashpack/gjagmgiddbbciopjhllkdnddhcglnemk",
    mobile: "https://www.hashpack.app/",
  },
  keplr: {
    browserExtension: "https://www.keplr.app/download",
    chrome: "https://chromewebstore.google.com/detail/keplr/dmkamcknogkgcdfhhbddcghachkejeap",
    mobile: "https://www.keplr.app/download",
  },
} as const;

export const hashPackWallet = ({ projectId, walletConnectParameters }: WalletArgs): Wallet => {
  const provider = hashPackProvider();
  return {
    id: "hashpack",
    name: "HashPack",
    rdns: "app.hashpack",
    iconUrl: HASHPACK_ICON,
    iconBackground: "#12141c",
    installed: provider ? true : undefined,
    downloadUrls: downloads.hashpack,
    qrCode: provider
      ? undefined
      : {
          getUri: uri => uri,
          instructions: {
            learnMoreUrl: "https://docs.hashpack.app/dapp-developers/walletconnect",
            steps: [
              {
                step: "install",
                title: "Open HashPack",
                description: "Install the extension, or the iOS or Android app.",
              },
              {
                step: "create",
                title: "Use an ECDSA account",
                description: "Menu, add account, create new, advanced, ECDSA. An ED25519 account cannot sign.",
              },
              {
                step: "scan",
                title: "Scan this code in HashPack",
                description: "WalletConnect, then scan. Purchases are sent as eth_sendTransaction.",
              },
            ],
          },
        },
    extension: {
      instructions: {
        learnMoreUrl: "https://www.hashpack.app/",
        steps: [
          {
            step: "install",
            title: "Install HashPack",
            description: "The extension connects directly. WalletConnect is the fallback.",
          },
          {
            step: "create",
            title: "Create an ECDSA account",
            description: "Hedera portal accounts imported as ED25519 will not appear.",
          },
          { step: "refresh", title: "Refresh this page", description: "Then choose HashPack again." },
        ],
      },
    },
    createConnector: provider
      ? fromProvider("hashpack", "HashPack", provider)
      : getWalletConnectConnector({ projectId, walletConnectParameters }),
  };
};

export const keplrWallet = ({ projectId, walletConnectParameters }: WalletArgs): Wallet => {
  const provider = keplrProvider();
  return {
    id: "keplr",
    name: "Keplr",
    rdns: "app.keplr",
    iconUrl: KEPLR_ICON,
    iconBackground: "#1c1233",
    installed: provider ? true : undefined,
    downloadUrls: downloads.keplr,
    qrCode: provider
      ? undefined
      : {
          getUri: uri => uri,
          instructions: {
            learnMoreUrl: "https://docs.keplr.app/api/multi-ecosystem-support/evm",
            steps: [
              {
                step: "install",
                title: "Open Keplr",
                description: "Install the extension. The Ethereum provider is window.keplr.ethereum.",
              },
              {
                step: "create",
                title: "Approve Hedera testnet",
                description: "Chain id 296. Keplr does not ship Hedera as a built-in chain.",
              },
              {
                step: "scan",
                title: "Or scan with Keplr",
                description: "WalletConnect, if this Keplr build offers it.",
              },
            ],
          },
        },
    extension: {
      instructions: {
        learnMoreUrl: "https://www.keplr.app/download",
        steps: [
          { step: "install", title: "Install Keplr", description: "https://www.keplr.app/download" },
          {
            step: "create",
            title: "Enable the Ethereum provider",
            description: "A Cosmos-only account has no EVM address and cannot buy.",
          },
          { step: "refresh", title: "Refresh this page", description: "Then choose Keplr again." },
        ],
      },
    },
    createConnector: provider
      ? fromProvider("keplr", "Keplr", provider)
      : getWalletConnectConnector({ projectId, walletConnectParameters }),
  };
};
