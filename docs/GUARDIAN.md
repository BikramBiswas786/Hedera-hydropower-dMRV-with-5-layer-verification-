# Using this template next to Hedera Guardian

[Hedera Guardian](https://github.com/hashgraph/guardian) is the policy workflow engine: roles, verifiable credentials, and a methodology library that already includes CDM ACM0002, AMS-I.D, Tool 03 and Tool 07. This template does not replace that. It does the piece a policy calculation block does not: a contract that recomputes the tonne and is the supply key for the HTS credit, plus a public check anyone can re-run from HCS.

Use Guardian for the project developer, the VVB and the registry workflow. Call this template when the policy needs a deterministic number, or when the issuance itself has to be refused on-chain if the number does not match.

## What to call

Both routes are public. Neither writes to Hedera.

| Step | Request | Keep from the response |
| --- | --- | --- |
| Design, before registration | `POST /api/methodology/assess` with a project design | `assessment.eligible`, `assessment.failures`, `registration` |
| Monitoring period | `POST /api/mrv/verify` with readings, the plant, the metering record and the meter signature | `report.decision`, `report.emissions.unitsMinted`, `reportHash` |

`GET /api/mrv/scenarios/healthy` returns a body you can POST straight to `/api/mrv/verify`. `inflated` and `tampered` come back `REJECTED`. A rejected decision is not a mint. The contract will not mint it either, but this check happens before anything is published.

A Guardian [Http Request Block](https://guardian.hedera.com/docs/develop/guardian/workspace/policies/policy-creation/introduction/http-request-block.md) does not send the policy's verifiable credential. Map the monitored fields in the policy onto the verify body, then POST that JSON. Header secrets stay out of the policy export.

```text
POST https://hydro-dmrv.vercel.app/api/mrv/verify
Content-Type: application/json

{ "readings": [...], "plant": {...}, "metering": {...}, "signature": "0x…", "domain": { "chainId": 296, "registry": "0x…" } }
```

Store `report.decision` and `report.emissions` on the monitoring VC. Do not treat `APPROVED` from this API as a registry issuance. The live demo meter keys are public, so a signature on the demo plants is not evidence of a physical meter. A real plant registers a key that is not derived from the plant id.

Minting (`POST /api/mrv/attest`) needs `Authorization: Bearer $MRV_API_KEY`. Leave that off a policy that only needs the check.

## What this does not do

- It does not parse a Guardian VC, a DID document, or a policy schema.
- It does not run VVB approval, multi-sign, or retirement-pool workflows. Guardian already does.
- The SaucerSwap check in `prepare_purchase` is off-chain. The contract settles on Chainlink and Supra only.
- Guardian's ACM0002 policy and this engine do not match on every cell. The differences are in [methodology.md](methodology.md).
