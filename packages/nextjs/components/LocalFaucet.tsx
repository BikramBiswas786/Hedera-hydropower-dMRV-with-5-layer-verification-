"use client";

import { useState } from "react";
import { createWalletClient, http, parseEther } from "viem";
import { hardhat } from "viem/chains";
import { useAccount } from "wagmi";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { notification } from "~~/utils/scaffold-hbar";

/** Hardhat's first dev account. The local node holds its key and signs `eth_sendTransaction` for it. */
const LOCAL_FUNDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DRIP = parseEther("100");

/**
 * Local chain only: sends 100 HBAR from the node's unlocked dev account to the connected wallet, so a fresh burner
 * wallet can buy on `/market` right after `yarn deploy --network localhost`. On Hedera, use the portal faucet.
 */
export const LocalFaucet = () => {
  const { address } = useAccount();
  const [sending, setSending] = useState(false);
  if (!address) return null;

  const drip = async () => {
    setSending(true);
    try {
      const wallet = createWalletClient({ chain: hardhat, transport: http() });
      await wallet.sendTransaction({ account: LOCAL_FUNDER, to: address, value: DRIP, chain: hardhat });
      notification.success("Sent 100 local HBAR to your wallet");
    } catch (error) {
      notification.error(error instanceof Error ? error.message : "The local node did not accept the transfer");
    } finally {
      setSending(false);
    }
  };

  return (
    <button className="btn btn-primary btn-sm font-normal gap-1" onClick={drip} disabled={sending}>
      <BanknotesIcon className="h-4 w-4" />
      <span>{sending ? "Sending…" : "100 local HBAR"}</span>
    </button>
  );
};
