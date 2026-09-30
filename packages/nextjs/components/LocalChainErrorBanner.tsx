"use client";

import { useEffect } from "react";
import { hederaTestnet } from "viem/chains";
import { useSwitchChain } from "wagmi";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useLocalChainConnectionError } from "~~/hooks/scaffold-hbar/useLocalChainConnectionError";
import { localChainIsDefault } from "~~/scaffold.config";

/**
 * Shows a banner when the wallet is on the local chain and that node is not accepting requests.
 * A local quick start is trying to use the node, so the banner does not switch the wallet away.
 * A Hedera-first build (production, or no local deploy) moves a stuck local wallet to testnet.
 */
export const LocalChainErrorBanner = () => {
  const hasError = useLocalChainConnectionError();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (hasError && switchChain && !localChainIsDefault) {
      switchChain({ chainId: hederaTestnet.id });
    }
  }, [hasError, switchChain]);

  if (!hasError) return null;

  return (
    <div className="bg-error/10 border-b border-error/20 px-4 py-2 flex items-center justify-center gap-2 text-error">
      <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
      <p className="text-sm font-medium m-0">
        {localChainIsDefault ? (
          <>
            Cannot connect to the local node. Keep{" "}
            <code className="bg-error/20 px-1.5 py-0.5 rounded">yarn chain:offline</code> running, then refresh.
          </>
        ) : (
          <>
            Cannot connect to the local node. Run{" "}
            <code className="bg-error/20 px-1.5 py-0.5 rounded">yarn chain:offline</code> or switch to testnet.
          </>
        )}
      </p>
    </div>
  );
};
