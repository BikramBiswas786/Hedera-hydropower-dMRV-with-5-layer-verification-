"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ENDPOINTS = [
  ["POST", "/api/mrv/verify", "5-layer verification of readings (no credentials)"],
  ["GET", "/api/mrv/scenarios/{name}", "Deterministic sample telemetry"],
  ["GET", "/api/registry", "On-chain totals, plants, oracle price"],
  ["GET", "/api/registry/attestations/{id}/reproduce", "Re-run the engine on readings published to HCS"],
  ["POST", "/api/market/prepare-purchase", "Unsigned buy / buy-and-retire tx for your own wallet"],
  ["POST", "/api/mrv/attest", "Verify → HCS → mint (Bearer MRV_API_KEY)"],
] as const;

export const AgentAccess = () => {
  const [origin, setOrigin] = useState("http://localhost:3000");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <section className="bg-base-100 border border-base-300 rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold m-0">Built for AI agents</h2>
        <p className="text-base-content/70 mb-0">
          Every capability of this app is exposed as an MCP server and a JSON API, so agents can generate telemetry,
          verify it, audit issuances and read the market without scraping UI. Read-only tools need no credentials.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold m-0">Connect over MCP</h3>
          <pre className="bg-base-200 rounded-xl p-3 text-xs overflow-x-auto m-0">
            {`claude mcp add --transport http hydro-dmrv ${origin}/api/mcp`}
          </pre>
          <pre className="bg-base-200 rounded-xl p-3 text-xs overflow-x-auto m-0">
            {JSON.stringify({ mcpServers: { "hydro-dmrv": { url: `${origin}/api/mcp` } } }, null, 2)}
          </pre>
          <p className="text-sm m-0">
            Machine-readable overview:{" "}
            <Link className="link link-primary" href="/llms.txt">
              /llms.txt
            </Link>
          </p>
        </div>
        <div className="overflow-x-auto">
          <h3 className="font-semibold m-0 mb-2">REST</h3>
          <table className="table table-xs">
            <tbody>
              {ENDPOINTS.map(([method, path, purpose]) => (
                <tr key={path}>
                  <td>
                    <span className="badge badge-ghost badge-sm">{method}</span>
                  </td>
                  <td className="font-mono">{path}</td>
                  <td>{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
