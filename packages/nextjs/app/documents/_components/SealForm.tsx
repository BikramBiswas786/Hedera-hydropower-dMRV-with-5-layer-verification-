"use client";

import { type FormEvent, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

const TYPES = [
  ["project-description", "proponent"],
  ["validation-report", "auditor"],
  ["registry-decision", "registry"],
  ["monitoring-report", "proponent"],
  ["verification-report", "verifier"],
] as const;

export function SealForm() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [type, setType] = useState<(typeof TYPES)[number][0]>("monitoring-report");
  const [subjectId, setSubjectId] = useState("HYDRO-DEMO-01");
  const [section, setSection] = useState("5.1");
  const [text, setText] = useState("Period checked against the public log.");
  const [result, setResult] = useState("Connect a wallet, then sign. This does not mint a credit.");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!address) {
      setResult("Connect a wallet first. Signing does not send a transaction.");
      return;
    }
    const role = TYPES.find(row => row[0] === type)?.[1];
    const prepared = await fetch("/api/documents/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        subjectId,
        role,
        sections: { [section]: text },
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
      <h2 className="text-lg font-bold m-0">Sign a section</h2>
      <label className="flex flex-col gap-1 text-sm">
        Document
        <select
          className="select select-bordered"
          value={type}
          onChange={event => setType(event.target.value as (typeof TYPES)[number][0])}
        >
          {TYPES.map(([name, role]) => (
            <option key={name} value={name}>
              {name} · {role}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Subject
        <input
          className="input input-bordered"
          value={subjectId}
          onChange={event => setSubjectId(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Section
        <input className="input input-bordered" value={section} onChange={event => setSection(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Text
        <textarea className="textarea textarea-bordered" value={text} onChange={event => setText(event.target.value)} />
      </label>
      <button className="btn btn-primary w-fit" type="submit">
        Sign and check
      </button>
      <pre className="text-xs overflow-x-auto m-0 whitespace-pre-wrap">{result}</pre>
    </form>
  );
}
