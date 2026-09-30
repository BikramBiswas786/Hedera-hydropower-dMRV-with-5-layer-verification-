"use client";

import { useEffect, useRef, useState } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { hardhat } from "viem/chains";
import { WagmiProvider, useAccount, useConnect } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { LocalChainErrorBanner } from "~~/components/LocalChainErrorBanner";
import { BlockieAvatar } from "~~/components/scaffold-hbar";
import scaffoldConfig, { localChainIsDefault } from "~~/scaffold.config";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const BURNER_CONNECTOR_ID = "burnerWallet";

/** Local quick start only: connect the burner once, so the footer faucet has an address to fund. */
const ConnectLocalBurner = () => {
  const { connect, connectors } = useConnect();
  const { status } = useAccount();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (!localChainIsDefault) {
      attempted.current = true;
      return;
    }
    if (status === "connecting" || status === "reconnecting") return;
    if (status === "connected") {
      attempted.current = true;
      return;
    }
    const burner = connectors.find(connector => connector.id === BURNER_CONNECTOR_ID);
    if (!burner) return;
    attempted.current = true;
    void Promise.resolve(connect({ connector: burner, chainId: hardhat.id })).catch(() => {
      // The Connect button remains if the burner cannot attach.
    });
  }, [connect, connectors, status]);

  return null;
};

const ScaffoldHbarApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className="flex flex-col min-h-screen">
        <Header />
        <LocalChainErrorBanner />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldHbarAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rainbowKitTheme = mounted
    ? isDarkMode
      ? darkTheme({
          accentColor: "#8259ef",
          accentColorForeground: "white",
          borderRadius: "large",
          fontStack: "system",
          overlayBlur: "small",
        })
      : lightTheme({
          accentColor: "#4f46e5",
          accentColorForeground: "white",
          borderRadius: "large",
          fontStack: "system",
          overlayBlur: "small",
        })
    : lightTheme({
        accentColor: "#4f46e5",
        accentColorForeground: "white",
        borderRadius: "large",
        fontStack: "system",
        overlayBlur: "small",
      });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ProgressBar height="3px" color="#2299dd" />
        <RainbowKitProvider
          avatar={BlockieAvatar}
          coolMode
          initialChain={scaffoldConfig.targetNetworks[0]}
          theme={rainbowKitTheme}
        >
          <ConnectLocalBurner />
          <ScaffoldHbarApp>{children}</ScaffoldHbarApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
