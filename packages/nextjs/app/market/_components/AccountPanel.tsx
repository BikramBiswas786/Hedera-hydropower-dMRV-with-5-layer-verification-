"use client";

import { useState } from "react";
import { formatHbar, mwhToUnits, usdToCents } from "./pricing";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract, useTransactor } from "~~/hooks/scaffold-hbar";
import { formatMwh } from "~~/services/mrv/views";

/** HIP-719: HTS tokens expose `associate()` at their EVM address so an EOA can opt in to holding them. */
const HRC719_ABI = [
  { type: "function", name: "associate", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
] as const;

type Action = "sell" | "retire" | "withdraw";

export const AccountPanel = ({ address, nativeUnitsPerHbar }: { address?: Address; nativeUnitsPerHbar: bigint }) => {
  const [action, setAction] = useState<Action>("sell");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("12.50");
  const [beneficiary, setBeneficiary] = useState("");

  const { data: custody } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "custodyBalanceOf",
    args: [address],
    query: { enabled: Boolean(address) },
  });
  const { data: proceeds } = useScaffoldReadContract({
    contractName: "HydroREC",
    functionName: "proceedsOf",
    args: [address],
    query: { enabled: Boolean(address) },
  });
  const { data: recToken } = useScaffoldReadContract({ contractName: "HydroREC", functionName: "recToken" });
  const { writeContractAsync, isMining } = useScaffoldWriteContract({ contractName: "HydroREC" });
  const { writeContractAsync: writeToken } = useWriteContract();
  const transact = useTransactor();

  if (!address) {
    return (
      <div className="bg-base-100 border border-base-300 rounded-2xl p-5">
        <h2 className="font-semibold text-lg mt-0">Your registry account</h2>
        <p className="m-0 text-base-content/60">Connect a wallet to see your RECs and sale proceeds.</p>
      </div>
    );
  }

  const units = mwhToUnits(amount);
  const cents = usdToCents(price);
  const exceeds = units !== null && custody !== undefined && units > custody;
  const ready = units !== null && !exceeds && !isMining && (action !== "sell" || cents !== null);

  const submit = async () => {
    if (!ready) return;
    if (action === "sell" && cents !== null) {
      await writeContractAsync({ functionName: "createListing", args: [units, cents] });
    } else if (action === "retire") {
      await writeContractAsync({ functionName: "retire", args: [units, beneficiary] });
    } else if (action === "withdraw") {
      await writeContractAsync({ functionName: "withdraw", args: [units] });
    }
    setAmount("");
  };

  return (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-5 flex flex-col gap-3">
      <h2 className="font-semibold text-lg m-0">Your registry account</h2>
      <div className="flex justify-between text-sm">
        <span>RECs in custody</span>
        <span className="font-bold">{custody === undefined ? "…" : `${formatMwh(custody)} MWh`}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span>Sale proceeds</span>
        <span className="flex items-center gap-2">
          <span className="font-bold">
            {proceeds === undefined ? "…" : `${formatHbar(proceeds, nativeUnitsPerHbar)} HBAR`}
          </span>
          {proceeds !== undefined && proceeds > 0n && (
            <button
              className="btn btn-xs btn-primary"
              disabled={isMining}
              onClick={() => writeContractAsync({ functionName: "withdrawProceeds" })}
            >
              Claim
            </button>
          )}
        </span>
      </div>

      <div role="tablist" className="tabs tabs-box tabs-sm">
        {(["sell", "retire", "withdraw"] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={action === tab}
            className={`tab ${action === tab ? "tab-active" : ""}`}
            onClick={() => setAction(tab)}
          >
            {tab === "sell" ? "List for sale" : tab === "retire" ? "Retire" : "To wallet"}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="w-24">Amount</span>
        <input
          className={`input input-bordered input-sm grow ${exceeds ? "input-error" : ""}`}
          value={amount}
          placeholder="0.5"
          inputMode="decimal"
          onChange={event => setAmount(event.target.value)}
        />
        <span>MWh</span>
      </label>

      {action === "sell" && (
        <label className="flex items-center gap-2 text-sm">
          <span className="w-24">Price</span>
          <input
            className="input input-bordered input-sm grow"
            value={price}
            inputMode="decimal"
            onChange={event => setPrice(event.target.value)}
          />
          <span>USD/MWh</span>
        </label>
      )}
      {action === "retire" && (
        <input
          className="input input-bordered input-sm"
          placeholder="Beneficiary (optional)"
          maxLength={128}
          value={beneficiary}
          onChange={event => setBeneficiary(event.target.value)}
        />
      )}
      {action === "withdraw" && (
        <p className="m-0 text-xs text-base-content/70">
          HTS tokens need an association before your wallet can hold them.{" "}
          <button
            className="link link-primary"
            disabled={!recToken}
            onClick={() =>
              recToken && transact(() => writeToken({ address: recToken, abi: HRC719_ABI, functionName: "associate" }))
            }
          >
            Associate HREC
          </button>{" "}
          once, then withdraw.
        </p>
      )}

      <button className="btn btn-primary btn-sm" disabled={!ready} onClick={submit}>
        {action === "sell" ? "Create listing" : action === "retire" ? "Retire RECs" : "Withdraw to wallet"}
      </button>
    </div>
  );
};
