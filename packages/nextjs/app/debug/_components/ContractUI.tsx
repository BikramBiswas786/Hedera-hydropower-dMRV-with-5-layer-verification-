"use client";

// @refresh reset
import { Contract } from "@scaffold-hbar-ui/debug-contracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-hbar";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar/useTargetNetwork";
import { ContractName } from "~~/utils/scaffold-hbar/contract";

type ContractUIProps = {
  contractName: ContractName;
  className?: string;
};

const PURCHASE = new Set(["buy", "buyAndRetire"]);

/**
 * UI component to interface with deployed contracts.
 * Purchases are left off the registry so this page cannot skip the SaucerSwap check.
 **/
export const ContractUI = ({ contractName }: ContractUIProps) => {
  const { targetNetwork } = useTargetNetwork();
  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo({ contractName });

  if (deployedContractLoading) {
    return (
      <div className="mt-14">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!deployedContractData) {
    return (
      <p className="text-3xl mt-14">
        No contract found by the name of {String(contractName)} on chain {targetNetwork.name}!
      </p>
    );
  }

  const hidePurchase = contractName === "HydroCreditRegistry";
  const contract = hidePurchase
    ? {
        ...deployedContractData,
        abi: deployedContractData.abi.filter(
          item => !("name" in item) || !PURCHASE.has(String(item.name)),
        ) as unknown as typeof deployedContractData.abi,
      }
    : deployedContractData;

  return (
    <div className="flex flex-col gap-3">
      {hidePurchase ? (
        <p className="m-0 text-sm">
          Buy and buy-and-retire are not on this page. Use the market. It will not build a purchase unless the
          SaucerSwap pool is inside 3% of the settlement price.
        </p>
      ) : null}
      <Contract contractName={contractName as string} contract={contract} chainId={targetNetwork.id} />
    </div>
  );
};
