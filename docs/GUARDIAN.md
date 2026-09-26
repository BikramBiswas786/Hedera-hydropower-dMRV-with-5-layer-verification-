# Using this template next to Hedera Guardian

[Hedera Guardian](https://github.com/hashgraph/guardian) is the policy workflow engine: roles, verifiable credentials, and a methodology library that already includes CDM ACM0002, AMS-I.D, Tool 03 and Tool 07. This template does not replace that. It does the piece a policy calculation block does not: a contract that recomputes the tonne and is the supply key for the HTS credit, plus a public check anyone can re-run from HCS.

There are two ways to connect a policy:

1. **The Guardian bridge** (below, recommended). A policy's `httpRequestBlock` posts its Monitoring Report VC to `/api/guardian/v1/cross-check`. We answer with a *DMRV Cross-Check Result* VC signed by our own `did:hedera` DID, which Guardian verifies and stores like any other document. Evidence goes the other way through `/api/guardian/v1/evidence/{timestamp}`.
2. **Plain JSON calls** to `/api/mrv/verify` and `/api/methodology/assess` ([at the end](#plain-json-calls-without-the-bridge)). No VC and no DID, so Guardian can store the result but cannot verify who produced it.

Target: **Guardian 3.7.0**. Everything marked [src] was read in the Guardian source at tag `3.7.0`.

## Issuer of record: one mint, not two

For every bridged project, **our registry is the issuer of record** and mints the HYCC credit. Guardian cross-checks and records; it must **not** mint the same tonnes. Each result VC says `issuerOfRecord: "DMRV"`. The evidence verifier refuses any Guardian chain that contains a `MintToken` VC. Patch step 5 below switches off your policy's own mint for bridged projects.

## 1. One-time setup on our side

| Step | Command / value |
| --- | --- |
| Create the bridge key and DID (dry run first) | `cd packages/nextjs && yarn guardian:publish-did --generate-key` prints the topic transaction, DID document and HCS message and sends nothing. The key is written to `.secrets/bridge-ed25519.key` (gitignored, mode 600). |
| Publish it | `HEDERA_OPERATOR_ID=… HEDERA_OPERATOR_KEY=… FILEBASE_IPFS_RPC_TOKEN=… yarn guardian:publish-did --send`. This makes one `TopicCreate` (submit key = the bridge key, so nobody else can post a competing DID message), pins the DID document to Filebase, and posts Guardian's `DID-Document` message. |
| Server env (Vercel) | `BRIDGE_ED25519_PRIVATE_KEY` (the DER key), `BRIDGE_DID` (printed by the script), `GUARDIAN_BRIDGE_API_KEY` (a long random string), `GUARDIAN_BRIDGE_RESULT_SCHEMA` (step 2). Until all four are set, the route answers **503** and says which one is missing. |

What the script publishes is exactly what Guardian's `RemoteDidLoader` resolves [src `common/src/document-loader/remote-did-loader.ts`]. It reads the topic in the DID, takes the **first** `DID-Document` message for that DID, and fetches its `cid` through the instance's IPFS gateway:

```text
DID       did:hedera:testnet:<base58(sha256(ed25519 public key))>_<topic>
document  {"@context":"https://www.w3.org/ns/did/v1","id":DID,
           "verificationMethod":[{"id":DID#did-root-key,"type":"Ed25519VerificationKey2018","controller":DID,"publicKeyBase58":…}],
           "authentication":[DID#did-root-key],"assertionMethod":["#did-root-key"]}
message   {"id":<uuid>,"status":"ISSUE","type":"DID-Document","action":"create-did-document","lang":"en-US","did":DID,"cid":<cid>,"uri":"ipfs://<cid>"}
```

Because Guardian takes the first message, **rotating the key means a new DID**. Old results stay verifiable while the old topic message and CID stay pinned. If the Guardian instance cannot fetch our CID, register the bridge as a policy user with *Bring your own DID*; Guardian then resolves it from its own database (`LocalDidLoader`).

## 2. Import the result schema

Import [`docs/guardian/DMRV Cross-Check Result.xlsx`](guardian/DMRV%20Cross-Check%20Result.xlsx) into the policy (*Schemas → Import → Import from Excel*). It uses the 3.7.0 Excel layout: name in A1, `Schema Description` and `Schema Type` rows, the header row `Required Field | Field Type | Parameter | Visibility | Description | Allow Multiple Answers | Test Value | Default Value | Suggest Value | Key`, and a shared `Enums` sheet. The same fields in JSON are in [`docs/guardian/dmrv-cross-check-result.schema.json`](guardian/dmrv-cross-check-result.schema.json). Regenerate both with `yarn guardian:schema`.

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `bridgeVersion` | String | Yes | `guardian-bridge@1` |
| `decision` | Enum `MATCH` / `MISMATCH` / `NOT_COMPARABLE` | Yes | Result of our recomputation |
| `methodologyId`, `moduleVersion` | String, Integer | Yes | `hydro/acm0002+vmr0017`, `1` |
| `sourceVcId`, `sourceVcHash` | String | Yes | `id` of the Monitoring Report VC we received, and keccak256 of its canonical JSON |
| `oursBEt` … `oursERt` | Number | Yes | Our BE, PE, LE, ER in t CO2e (6 dp) |
| `theirsBEt` … `theirsERt` | Number | Yes | Your field24–27 as received |
| `deltaERg` | Integer | Yes | Our ER minus yours, in grams |
| `notes` | String, multiple | No | Reasons, tolerances and caveats |
| `registryAddress`, `projectId`, `attestationIds` | String, String, Integer multiple | No | Our registry references, when the project is registered there |
| `issuerOfRecord` | Enum `DMRV` | Yes | Always `DMRV` |

After you publish the schema (or while it is a draft, for dry runs), set `GUARDIAN_BRIDGE_RESULT_SCHEMA` so our VC names it the way Guardian's `verifySchema` looks it up:

```bash
# published schema: iri without "#", and its contextURL
GUARDIAN_BRIDGE_RESULT_SCHEMA='{"type":"<uuid>&1.0.0","contextUrl":"ipfs://<cid>"}'
# draft schema, dry run
GUARDIAN_BRIDGE_RESULT_SCHEMA='{"type":"<uuid>","contextUrl":"schema:<uuid>"}'
# several policies: key by policyId, with an optional default
GUARDIAN_BRIDGE_RESULT_SCHEMA='{"<policyId>":{"type":"…","contextUrl":"…"},"default":{…}}'
```

## 3. Field mapping (spec §6.3)

We read the Monitoring Report (`#e801fa39-07b6-4da0-973a-13c9acdb6b76`) VC's first `credentialSubject` and rebuild a greenfield VMR0017 period for the hydro module. Numbers may arrive as JSON numbers or numeric strings; decimals are scaled exactly, never through floats.

| Guardian field | Meaning | Used as |
| --- | --- | --- |
| field3 / field4 | EF_OM / EF_BM (t CO2/MWh) | EF_CM = w_OM·EF_OM + w_BM·EF_BM, rounded to whole g/MWh |
| field5 / field6 | w_OM / w_BM | weights (a note if they do not sum to 1) |
| field7 | EG_PJ (MWh) | net generation |
| field30 | TEG (MWh) | gross generation, for PE_HP |
| field8 / field9 | hydro flag / new-or-enlarged reservoir | must be hydro; reservoir enables the power-density rule |
| field10 / field29, field11 / field28 | A_PJ / A_BL (km²), Cap_PJ / Cap_BL (MW) | power density; Cap_BL > 0 is NOT_COMPARABLE (needs historical baseline) |
| field13, field44 | EF_Res (kg/MWh), EF_embodied (g/kWh) | notes only if they differ from VMR0017's fixed 100 and 21 |
| field14 / field15 / field16 | co-firing flag, fuel (GJ), EF (t CO2/GJ) | PE_FF = GJ × t/GJ, rounded up |
| field24–27 | BE / PE / LE / ER as your policy computed them | compared with ours |

**Decision.** `MATCH` if BE is within 1 g (plus half a gram per MWh when EF_CM had to be rounded), PE within 2 g, LE within 1 g, and ER within the sum. `MISMATCH` otherwise, with the per-term difference in `notes`. `NOT_COMPARABLE` when the report is outside the hydro module: field8 ≠ 1, any geothermal/BESS/fire-suppression term (field31–33, 35–39, 41–43) non-zero, a geothermal plant type in field34, power density ≤ 4 W/m² or field40 set, Cap_BL > 0, or capacity above 15 MW. A negative ER is floored at 0 like your policy, with a note.

## 4. The call: `httpRequestBlock`

Add after the SR's approved-report save. In your VMR0017 policy that means after `sr_save_reassigned_approved_report_db`, which today fires `RunEvent` into `vmr0017_er_gate`. Point that event at `dmrv_cross_check` instead (see step 5).

```json
{
  "blockType": "httpRequestBlock",
  "tag": "dmrv_cross_check",
  "permissions": ["OWNER"],
  "defaultActive": false,
  "onErrorAction": "no-action",
  "method": "POST",
  "url": "https://<your-app>/api/guardian/v1/cross-check?policyId=${document.credentialSubject.0.policyId}",
  "headers": [
    { "name": "Authorization", "value": "Bearer <GUARDIAN_BRIDGE_API_KEY>", "included": false },
    { "name": "Content-Type", "value": "application/json", "included": true }
  ],
  "events": [
    { "source": "dmrv_cross_check", "target": "dmrv_result_gate", "output": "RunEvent", "input": "RunEvent", "actor": "", "disabled": false },
    { "source": "dmrv_cross_check", "target": "dmrv_cross_check_error", "output": "ErrorEvent", "input": "RunEvent", "actor": "", "disabled": false }
  ]
}
```

- The block **POSTs the input VC itself** after `${…}` substitution; it has no separate body [src `http-request-block.ts`]. Redirects are off (`maxRedirects: 0`), so use the final URL (no `http→https` or apex→`www` redirect).
- Leave **"Include value in exported policy" unchecked** for `Authorization`. Guardian will not publish a header that has a value but is excluded, so clear the value before export and type it again after import.
- Guardian runs `verifySchema` then `verifyVC` on our answer and throws `Received data is not VC` otherwise. Our errors are JSON (`{"error": "…"}`), so any non-200 surfaces as that error. Wire `ErrorEvent` to a `notificationBlock` (type ERROR, user `POLICY_OWNER`) tagged `dmrv_cross_check_error`.
- Status codes: 503 bridge not configured, 401 bad bearer, 413 body > 1 MB, 400 not one VC, 422 a required field (field3–8, field24–27) is missing or not a number, 429 more than 60 calls a minute per server instance. Repeated calls for the same VC return the same signed result (idempotent on `sourceVcHash`). We log the hash, never the document.

## 5. Gate the answer and switch off Guardian's mint

**Gate: `documentValidatorBlock` `dmrv_result_gate`.** `httpRequestBlock` already throws unless the signature verifies, but it accepts **any** resolvable `did:hedera` issuer, and it stores the result with `signature: 0` (NEW), not 1 [src `PolicyUtils.createVC`]. So on this path, gate on the issuer and the decision:

```json
{
  "blockType": "documentValidatorBlock",
  "tag": "dmrv_result_gate",
  "permissions": ["OWNER"],
  "documentType": "vc-document",
  "schema": "#<DMRV Cross-Check Result uuid>",
  "conditions": [
    { "field": "document.issuer", "type": "equal", "value": "<BRIDGE_DID>", "valueSource": "value" },
    { "field": "document.credentialSubject.0.issuerOfRecord", "type": "equal", "value": "DMRV", "valueSource": "value" },
    { "field": "document.credentialSubject.0.decision", "type": "equal", "value": "MATCH", "valueSource": "value" }
  ],
  "events": [{ "source": "dmrv_result_gate", "target": "save_dmrv_cross_check", "output": "RunEvent", "input": "RunEvent", "actor": "", "disabled": false }]
}
```

Drop the `decision` condition if you want `MISMATCH` and `NOT_COMPARABLE` results saved for the VVB too.

**Metered mode (`externalDataBlock` `dmrv_metered_ingest`).** That block does **not** reject bad signatures; it stores them as `INVALID` (2) [src `external-data-block.ts`], and it needs no authentication. So its child `documentValidatorBlock` must check the signature as well:

```json
{ "field": "signature", "type": "equal", "value": "1", "valueSource": "value" },
{ "field": "document.issuer", "type": "equal", "value": "<BRIDGE_DID>", "valueSource": "value" }
```

Keep `"valueSource": "value"`. Without it Guardian uses its legacy comparison, which is strict `===`, and the string `"1"` never equals the stored number `1` [src `PolicyUtils.checkDocumentField`]. With it, both sides are coerced.

**Save: `sendToGuardianBlock` `save_dmrv_cross_check`.** Same shape as your `sr_save_reassigned_approved_report_hedera`: `"dataSource": "hedera"`, `"dataType": "vc-documents"`, `"topic": "Project"`, `"entityType": "dmrv_cross_check"`, `"schema": "#<DMRV Cross-Check Result uuid>"`. Then a `database` save if you need one, and an `interfaceDocumentsSourceBlock` grid filtered on the result schema for the VVB and SR.

**Switch off the mint for bridged projects.** Your policy mints through `vmr0017_er_gate` (switchBlock, `Condition_0: field27 > 0`) → `mintToken` (mintDocumentBlock, rule `field27`, token "VCU VMR0017").

- *Whole policy bridged (simplest).* Retarget `sr_save_reassigned_approved_report_db`'s `RunEvent` from `vmr0017_er_gate` to `dmrv_cross_check`, and set `"disabled": true` on the `vmr0017_er_gate → mintToken` event. Leave `mintToken` in place (the `tokens_grid` and `vp_grid` refreshes still reference it) or delete it together with the grid's dependency on it.
- *Mixed policy.* Add an Enum field `issuerOfRecord` (`DMRV`, `GUARDIAN`) to the project/monitoring schema and give `vmr0017_er_gate` two conditions with `executionFlow: "firstTrue"`:

  ```json
  "conditions": [
    { "tag": "Condition_0", "type": "equal", "value": "equalText(issuerOfRecord, \"DMRV\")", "target": "dmrv_cross_check" },
    { "tag": "Condition_1", "type": "equal", "value": "field27 > 0", "target": "mintToken" }
  ]
  ```

  Switch conditions are mathjs expressions over the first `credentialSubject` [src `switch-block.ts`]. Compare strings with `equalText(…)`: mathjs `==` tries to convert strings to numbers, and an expression that throws is simply false.

## 6. Completion: webhook or poll

Guardian runs the chain asynchronously. To learn that a result was saved:

- **Webhook (self-hosted Guardian).** The Application Events Module (port 3012): `POST /api/webhooks` with `{ "url": "https://<your-app>/…", "events": ["block_complete", "token_minted"] }`; manage with `GET|PUT|DELETE /api/webhooks/{id}`. `block_complete` carries `{trackingId, blockType, blockTag, blockId, policyId, userId, status, outputData?, error?, timestamp}`. Accept only `blockTag` ∈ {`dmrv_cross_check`, `save_dmrv_cross_check`, `dmrv_metered_ingest`}. The payload is unsigned, so treat it as a hint and re-read the document (below) before acting. A `token_minted` event for a bridged policy means the mint was not switched off: treat it as an alarm. This template does not ship a webhook receiver yet.
- **Poll (Managed Guardian Service, or no webhook).** Log in (`POST /api/v1/accounts/login` → `refreshToken`, `POST /api/v1/accounts/access-token` → `accessToken`), then `GET /api/v1/policies/{policyId}/tag/save_dmrv_cross_check/blocks` or the result grid's tag. For pushes into `dmrv_metered_ingest`, `POST /api/v1/external/{policyId}/dmrv_metered_ingest/sync-events?history=true` returns `response`, `result` and `steps` synchronously. Always address blocks by **tag**; block UUIDs change on every dry run and republish.
- **Public check.** Once saved to Hedera, anyone can verify the result and its chain from the mirror node with `GET /api/guardian/v1/evidence/{timestamp}?topicIds=<policy topic>`.

## 7. Policy Integrity Test recipe

Run in **dry run** with the draft schema (`"contextUrl":"schema:<uuid>"` in `GUARDIAN_BRIDGE_RESULT_SCHEMA`), against a preview deployment that has the bridge env set. Do not mock our endpoint with dry-run API mocks: the point is to test the real signature.

1. Put the policy in dry run, open it and **start recording**.
2. Submit a Monitoring Report whose field24–27 match (e.g. EG 1000 MWh, EF_OM 0.8, EF_BM 0.6, weights 0.5/0.5, BE 700, PE 0, LE 21, ER 679). In the *Test* menu tick "capture input".
3. Approve it as VVB and SR. Check the *Test* menu shows a *DMRV Cross-Check Result* output with `decision: MATCH`, `issuer` = your bridge DID and `issuerOfRecord: DMRV`, and **no** MintToken document. Tick it as an expected output.
4. Submit a second report with ER changed (e.g. field27 = 800). Expect either no saved result (with the `decision` condition) or a saved `MISMATCH`, and still no mint.
5. For the gate itself: temporarily set `BRIDGE_DID`/key to a second published DID and repeat step 2. Expect `dmrv_result_gate` to fail with `Field "issuer": …`. Restore the env.
6. Stop recording and save the test. Attach it with `POST /api/v1/policies/{policyId}/test` (the recorded file) and run it with `/test/{testId}/start`; read `/test/{testId}/details`.
7. Re-run the test after every policy change and when moving from 3.7.0 to 3.7.1.

## 8. Using Guardian evidence in our registry

`GET /api/guardian/v1/evidence/{ref}?topicIds=0.0.a,0.0.b` (MCP tool `verify_guardian_evidence`) accepts a VP consensus timestamp, a mint transaction id (`0.0.x@secs.nanos`; the VP timestamp is read from the mint memo) or `nft:<tokenId>:<serial>` (read from the NFT metadata). It:

1. reads the HCS message from the mirror node (chunks reassembled) and requires it to be on one of `topicIds` (or `GUARDIAN_EVIDENCE_TOPIC_IDS`) with status `ISSUE`;
2. fetches the VP or VC from IPFS (`GUARDIAN_IPFS_GATEWAY`) and verifies every Ed25519Signature2018 proof with the same library Guardian uses, resolving issuers the way `RemoteDidLoader` does (VP challenge `"123"`, as Guardian signs);
3. recomputes every VMR0017 Monitoring Report it finds (§3) and walks `relationships` up to three levels;
4. **refuses** the chain if it contains a `MintToken` or `MintNFToken` VC (Guardian already minted those tonnes), a bad signature, a revoked message, or a Monitoring Report that does not `MATCH`.

The response includes `evidenceHash = keccak256("guardian:" ‖ consensusTimestamp ‖ ":" ‖ cid)`, the value a VVB signs.

## What is verified here and what needs a live Guardian

Covered by tests in this repo: the VC round-trip through a line-for-line port of Guardian's `VCJS.verify`, with the DID resolved from (mocked) HCS and IPFS exactly as `RemoteDidLoader` does; tampering and wrong-key failures; verification under a Guardian-style schema context; the field mapping; evidence refusals; the 503/401/413/400/422 paths.

Needs a live Guardian dry run: `verifySchema` against the imported schema; DID resolution through the instance's IPFS gateway; the `valueSource` coercion in `documentValidatorBlock`; `equalText` in the switch; webhook availability on Managed Guardian Service; the real mint memo and NFT metadata format; the Excel import itself.

## Plain JSON calls without the bridge

Use Guardian for the project developer, the VVB and the registry workflow. Call this template when the policy needs a deterministic number, or when the issuance itself has to be refused on-chain if the number does not match.

### What to call

Both routes are public. Neither writes to Hedera.

| Step | Request | Keep from the response |
| --- | --- | --- |
| Design, before registration | `POST /api/methodology/assess` with a project design | `assessment.eligible`, `assessment.failures`, `registration` |
| Monitoring period | `POST /api/mrv/verify` with readings, the plant, the metering record and the meter signature | `report.decision`, `report.emissions.unitsMinted`, `reportHash` |

`GET /api/mrv/scenarios/healthy` returns a body you can POST straight to `/api/mrv/verify`. `inflated` and `tampered` come back `REJECTED`. A rejected decision is not a mint. The contract will not mint it either, but this check happens before anything is published.

Correction (checked in the Guardian 3.7.0 source): an [Http Request Block](https://guardian.hedera.com/docs/develop/guardian/workspace/policies/policy-creation/introduction/http-request-block.md) posts its input VC as the body, and it rejects any response that is not a verifiable VC ("Received data is not VC"). These plain routes return plain JSON, so an Http Request Block cannot consume them directly; use the bridge above for that. Call these routes from your own tooling or an operator script, map the monitored fields onto the verify body, and keep header secrets out of the policy export.

```text
POST https://hydro-dmrv.vercel.app/api/mrv/verify
Content-Type: application/json

{ "readings": [...], "plant": {...}, "metering": {...}, "signature": "0x…", "domain": { "chainId": 296, "registry": "0x…" } }
```

Store `report.decision` and `report.emissions` on the monitoring VC. Do not treat `APPROVED` from this API as a registry issuance. The live demo meter keys are public, so a signature on the demo plants is not evidence of a physical meter. A real plant registers a key that is not derived from the plant id.

Minting (`POST /api/mrv/attest`) needs `Authorization: Bearer $MRV_API_KEY`. Leave that off a policy that only needs the check.

### What this does not do

- These two routes do not parse a Guardian VC, a DID document, or a policy schema. The bridge above does.
- It does not run VVB approval, multi-sign, or retirement-pool workflows. Guardian already does.
- The SaucerSwap check in `prepare_purchase` is off-chain. The contract settles on Chainlink and Supra only.
- Guardian's ACM0002 policy and this engine do not match on every cell. The differences are in [methodology.md](methodology.md).
