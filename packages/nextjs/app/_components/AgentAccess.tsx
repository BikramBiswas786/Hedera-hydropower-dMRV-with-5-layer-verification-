"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const ENDPOINTS = [
  ["POST", "/api/mrv/verify", "Verify + quantify ER = BE − PE − LE (no credentials)"],
  ["POST", "/api/methodology/assess", "VMR0017 / CDM design check, combined margin, registration integers"],
  ["POST", "/api/methodology/grid-emission-factor", "TOOL07 or VT0011 combined margin from per-unit grid data"],
  ["GET", "/api/mrv/scenarios/{name}", "Deterministic sample monitoring data"],
  ["GET", "/api/registry", "On-chain totals, plants and ledgers, oracle price"],
  ["GET", "/api/registry/plants/{id}", "A plant's design, ledger, lifetime ER and attestations"],
  ["GET", "/api/registry/attestations/{id}/reproduce", "Re-run the engine on readings published to HCS"],
  ["POST", "/api/market/prepare-purchase", "Unsigned buy / buy-and-retire tx for your own wallet"],
  ["GET", "/api/registry/retirements?format=csv", "Retirement portfolio for ESG reporting"],
  ["POST", "/api/mrv/attest", "Verify → HCS → mint (Bearer MRV_API_KEY)"],
] as const;

export const AgentAccess = () => {
  const [origin, setOrigin] = useState("http://localhost:3000");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <section className="bg-base-100 border border-base-300 rounded-2xl">
      <details className="collapse collapse-arrow">
        <summary className="collapse-title text-lg font-semibold">For developers and agents</summary>
        <div className="collapse-content flex flex-col gap-4">
          <p className="text-base-content/70 mb-0">
            The same checks are available as an API. Visitors do not need this.
          </p>
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
                </Link>{" "}
                · OpenAPI 3.1:{" "}
                <a className="link link-primary" href="/api/openapi.json">
                  /api/openapi.json
                </a>
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
        </div>
      </details>
    </section>
  );
};
