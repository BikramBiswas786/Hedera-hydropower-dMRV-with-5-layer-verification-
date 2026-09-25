"use client";

import { useState, type FormEvent } from "react";
import { useAccount, useSignMessage } from "wagmi";

export function WaterForm() {
  const [people, setPeople] = useState(2000);
  const [passed, setPassed] = useState(92);
  const [result, setResult] = useState("Change the inputs and quantify. Nothing is written.");
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/water/quantify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "WATER-DEMO-01",
        population: people,
        litresPerPersonDay: 5,
        qpwMethod: "population",
        xBoil: 1,
        stoveEfficiency: 0.1,
        baselineFuelShare: 1,
        efCo2TonnesPerTj: 112,
        efNonCo2TonnesPerTj: 8.692,
        adjLe: 0.95,
        fnrbPathway: "TOOL30",
        tool30Nrb: 80,
        tool30Rb: 20,
        appliancesPassed: passed,
        appliancesTested: 100,
        monitoringDays: 365,
        reddCleared: true,
      }),
    });
    setResult(JSON.stringify(await response.json(), null, 2));
  }

  async function signDraft() {
    if (!address) {
      setResult("Connect a wallet first. Signing does not send a transaction.");
      return;
    }
    const prepared = await fetch("/api/documents/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "monitoring-report",
        subjectId: "WATER-DEMO-01",
        role: "proponent",
        sections: { "5.1": result.slice(0, 500) },
        previousHash: null,
        issuer: address,
      }),
    });
    const body = await prepared.json();
    if (!prepared.ok) {
      setResult(JSON.stringify(body, null, 2));
      return;
    }
    const signature = await signMessageAsync({ message: body.message });
    const checked = await fetch("/api/documents/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body.document, signature }),
    });
    setResult(JSON.stringify(await checked.json(), null, 2));
  }

  return (
    <form className="flex flex-col gap-3 bg-base-100 border border-base-300 rounded-2xl p-5" onSubmit={onSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        People
        <input className="input input-bordered" type="number" min={0} value={people} onChange={event => setPeople(Number(event.target.value))} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Appliances passing, of 100
        <input className="input input-bordered" type="number" min={0} max={100} value={passed} onChange={event => setPassed(Number(event.target.value))} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit">
          Quantify
        </button>
        <button className="btn btn-outline" type="button" onClick={signDraft}>
          Sign a monitoring note
        </button>
      </div>
      <pre className="text-xs overflow-x-auto m-0 whitespace-pre-wrap">{result}</pre>
    </form>
  );
}
