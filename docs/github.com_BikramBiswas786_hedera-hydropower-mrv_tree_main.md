# GitHub - BikramBiswas786/hedera-hydropower-mrv: This repository documents a complete, already-executed on-chain Proof of Concept (POC) for a Hydropower Measurement, Reporting, and Verification (MRV) system built on Hedera Hashgraph

**URL:** https://github.com/BikramBiswas786/hedera-hydropower-mrv/tree/main

---

Skip to content
Navigation Menu
Platform
Solutions
Resources
Open Source
Enterprise
Pricing
Sign in
Sign up
BikramBiswas786
/
hedera-hydropower-mrv
Public
Notifications
Fork 0
 Star 0
Code
Issues
Pull requests
Actions
Projects
Security
Insights
BikramBiswas786/hedera-hydropower-mrv
 main
1 Branch
0 Tags
Code
Folders and files
Name	Last commit message	Last commit date

Latest commit
BikramBiswas786
Clarify AI savings math - verification cost dominates total MRV
9e4a81b
 · 
History
66 Commits


code
	
Stop tracking service package-lock now that it is ignored
	


config
	
ENGINE V1 production baseline: docs, profiles, strict AI verifier, en…
	


docs
	
Update COST-ANALYSIS.md
	


evidence
	
Clarify AI savings math - verification cost dominates total MRV
	


scripts
	
Clarify AI savings math - verification cost dominates total MRV
	


src
	
ENGINE V1 production baseline: docs, profiles, strict AI verifier, en…
	


.env.example
	
ENGINE V1 production baseline: docs, profiles, strict AI verifier, en…
	


.gitignore
	
ENGINE V1 production baseline: docs, profiles, strict AI verifier, en…
	


BOUNTY_REQUEST.md
	
Create BOUNTY_REQUEST.md
	


DEPLOYMENT_EVIDENCE.md
	
Add deployment evidence documentation
	


EVIDENCE-SUMMARY.md
	
Update EVIDENCE-SUMMARY.md
	


LEGAL_ROYALTY_SIMPLE.md
	
Enhance legal document with royalty details and examples
	


LICENSE
	
Initial commit
	


PR_SUBMISSION.md
	
Update PR submission with regulatory correction and expanded details
	


README.md
	
ENGINE V1 production baseline: docs, profiles, strict AI verifier, en…
	


README_DEMO.md
	
Create README_DEMO.md for Hedera Playground usage
	
Repository files navigation
README
Apache-2.0 license
Hedera Hydropower dMRV – ACM0002-Style Digital MRV Tool on Hedera Testnet

Author: Bikram Biswas (@biswasbikram786)
Network: Hedera Testnet
Programme: DLT Earth Bounty
Status: Live digital MRV proof-of-concept (PoC) + Methodology Idea Note (MIN) submitted to Verra

1. What this repository actually is

This repository contains a complete, on-chain proof-of-concept for a hydropower-focused digital MRV tool that follows the structure and calculations of ACM0002 (grid-connected renewable electricity), implemented on Hedera Testnet.

The tool is designed to be:

Hydropower-specific – it assumes a grid-connected hydro unit with continuous generation and meter readings.
Digital-first – it uses DIDs, signed telemetry, and a public DLT (Hedera Consensus Service) as an immutable audit trail.
Methodology-aligned, not methodology-replacing – it implements ACM0002-style formulas and monitoring concepts but does not claim to be a new approved methodology by itself.

It is currently used to demonstrate a single synthetic scenario (“Scenario 1”) on Testnet and to support a Verra Methodology Idea Note (MIN) submission, not to run a live crediting project.

2. Honest status (February 2026)

Today, all of the following are true:

A working Testnet mini-tool is live:

POST /telemetry accepts signed payloads for a turbine (“TURBINE-1”), verifies signatures against a DID on an HCS topic, and writes AUDITv1 envelopes on-chain.
GET /mrv-snapshot/TURBINE-1?period=2026-01 aggregates telemetry and returns ACM0002-style MRV numbers:
91 readings for January 2026
EG_MWh = 16,800 (synthetic total net generation)
EF_grid = 0.8 tCO2/MWh (illustrative)
BE_tCO2 = 13,440, PE_tCO2 = 0, LE_tCO2 = 0, ER_tCO2 = 13,440.

A full monitoring report for this scenario exists:

docs/Monitoring-Report-Testnet-Scenario1.md tells the story of TURBINE-1 in 2026‑01, explains the inputs, shows the baseline and ER math, and links to on-chain evidence.

A clean evidence index exists:

evidence/txids.csv lists:
Operator accounts (e.g., 0.0.6255927, 0.0.6255880).
DID / audit topics (e.g., 0.0.7462776).
Tokens used in the PoC.
Key transactions (mint, burn, transfers, DID topic messages).
At least one TELEMETRY row tying Scenario 1 mini-tool telemetry to a real Testnet transaction.

A Verra MIN has been submitted:

VCS-MIN-v5.0-1: “Digitized Tool/Revision for ACM0002 – Blockchain-Enabled Digital MRV for Grid-Connected Hydropower Projects”.
It includes:
An ACM0002 Alignment Matrix mapping methodology sections to your digital implementation.
A Testnet evidence package derived from evidence/txids.csv.
Architecture and integrity details.

A roadmap of phases 0–5 exists in docs:

Phase 0 – Clean Testnet foundation (evidence, tests, integrity + regulatory docs).
Phase 1 – Verra MIN submitted, waiting/responding properly.
Phase 2 – Mini-tool API on Testnet.
Phase 3 – Canonical Scenario 1 (this 91-reading run) and monitoring report.
Phase 4 – Use this PoC to secure a pilot plant and a VVB.
Phase 5 – How a pilot evolves into a full Verra project (PDD, validation, registration, credits).

You do not yet have:

A Verra-approved methodology.
A Verra-registered project.
Issued credits from a real hydropower plant using this tool.

Those belong to Phases 4–5 with real partners.

3. Why this is hydropower-specific and relevant

Guardian and many MRV tools support generic renewable/carbon workflows. This repo narrows that to a hydropower-focused MRV story that includes:

Turbine-/gateway-level DIDs (each device can be identified and signed).
A pattern for continuous generation (daily net export readings, not one-off events).
A clear mapping to ACM0002 sections:
Baseline EG and EF,
Project emissions and leakage (set to zero in the PoC but structurally present),
Periodic emission reductions.

The value is not that the chain “does MRV by itself”, but that:

Data capture is cryptographically signed and timestamped.
Audit trail is immutable and publicly verifiable (Hedera topics + txids).
Calculations are transparent and testable (unit tests and documented formulas).

This makes it easier for a VVB or Verra to:

Recompute baseline and ER from raw data and compare with the tool.
Click HashScan links and see that the audit envelopes and DID messages really exist.
Understand exactly how the tool supports, rather than replaces, ACM0002.
4. Verra / VVB / operator view – how to read this repo

If you are a Verra reviewer, VVB, or hydropower operator, the recommended reading order is:

Overall guidebook and status

docs/VERRA-GUIDEBOOK.md – explains, in plain language, how this digital MRV tool can fit into a Verra ACM0002 project (and what it does not claim).
docs/PHASE0-STARTING-POINT.md – describes the current Testnet foundation and existing assets.
docs/PHASE1-2-TESTNET-ROADMAP.md – shows how the MIN and Testnet mini-tool fit into the roadmap.
docs/PHASE3-PILOT-READY-TESTNET.md – focuses on the canonical Scenario 1 PoC.
docs/PHASE4-PILOTS-AND-VVB.md – outlines how to use this PoC for pilot and VVB conversations.
docs/PHASE5-VERRA-PROJECT-PATH.md – explains the path from pilot to PDD, validation, registration, and issuance.

ACM0002 mapping and tests

docs/ACM0002-Alignment-Matrix.md – shows which parts of ACM0002 are implemented where.
docs/TEST-RESULTS.md – lists numeric test cases (e.g., EG=10,000 MWh, EF=0.8 → BE=8,000 tCO2) and confirms the tool’s calculations match ACM0002 formulas.

Data integrity and regulatory status

docs/DATA-INTEGRITY-DESIGN.md – describes DIDs, key management, nonces, replay protection, audit envelope structure, and use of Hedera topics.
docs/REGULATORY-STATUS.md – makes it explicit that:
The tool is designed to support ACM0002 projects.
It has not yet been reviewed/approved as a methodology or used in a registered project.

Testnet run and on-chain proof

docs/Monitoring-Report-Testnet-Scenario1.md – the “paper” report for TURBINE-1 in 2026‑01 (16,800 MWh, 13,440 tCO2, 91 readings).
evidence/txids.csv – the index of accounts, topics, tokens, and TELEMETRY txids with HashScan URLs you can click to verify the PoC on Hedera Testnet.
5. Code and structure – what runs where

High-level repo map:

code/service/ – Mini-tool API (Testnet PoC)

index.js – Node service exposing:
POST /telemetry – ingest signed payloads, verify DID, write AUDITv1.
GET /mrv-snapshot/:deviceId?period=YYYY-MM – compute EG, EF, BE, PE, LE, ER and return JSON (e.g., 16,800 MWh, 13,440 tCO2, 91 readings).
scenario1-seed.js – generates a synthetic 30-day net export pattern and pushes it through /telemetry to build Scenario 1 on Testnet.

code/playground/ – low-level Hedera demos (Testnet, PoC only)

Scripts like 01-deploy-did.js, 02-gateway-sign.js, 03-orchestrator-verify.js show:
Topic creation and DID publishing.
Gateway keypair generation and payload signing.
Orchestrator verification and token minting.
All scripts are clearly labeled as Playground PoC, not full ACM0002 MRV.

docs/ – Narrative and formal docs (Verra guidebook, phases 0–5, alignment, integrity, monitoring report).

evidence/ – Testnet evidence bundle

txids.csv – one-line-per-artifact list of the most important accounts, topics, tokens, and transactions, including TELEMETRY rows for Scenario 1.
6. One-line summary (for slides and emails)

An ACM0002-style hydropower digital MRV tool running on Hedera Testnet, with device DIDs, signed telemetry, on-chain audit envelopes, and a 91-reading January 2026 Scenario 1 monitoring report, designed to support future Verra ACM0002 projects but not yet used in an approved project.

## 7. For developers – how to rerun Scenario 1 locally

Prerequisites:

- Node.js installed (LTS is fine).
- Access to Hedera Testnet credentials (for the underlying Guardian / Playground flows).

Steps:

1. Clone and install:

   ```bash
   git clone https://github.com/BikramBiswas786/hedera-hydropower-mrv
   cd hedera-hydropower-mrv/code/service
   npm install

Start the Testnet mini-tool:

npm start

You should see: Testnet mini-tool listening on http://localhost:3000.

Seed Scenario 1 (synthetic January 2026 for TURBINE-1):

node scenario1-seed.js

This will send 30 synthetic daily readings multiple times until the total count reaches 91, printing lines like Day X sent: ... storedCount: 91.

Get the MRV snapshot:

curl "http://localhost:3000/mrv-snapshot/TURBINE-1?period=2026-01"

Expected JSON (values may differ slightly if you reseed, but should stay consistent with the pattern):

{"deviceId":"TURBINE-1","period":"2026-01","EG_MWh":16800,"EF_grid_tCO2_per_MWh":0.8,"BE_tCO2":13440,"PE_tCO2":0,"LE_tCO2":0,"ER_tCO2":13440,"count":91}

Cross-check with docs and evidence:

Compare these values with docs/Monitoring-Report-Testnet-Scenario1.md.
Explore evidence/txids.csv and open the listed HashScan URLs for DID topics and TELEMETRY txids.
This repo ships one Verra-aligned MRV engine (ENGINE V1) plus a configurable execution layer.
All behaviour is controlled via `config/project-profile.json`:
- Scope: device vs project vs both.
- Anchoring: direct vs Merkle, plus frequency and batch mode.
- Verification: human-only vs AI-assisted, with adjustable trust threshold.
See `docs/ENGINE-V1.md` for the fixed engine definition and `docs/ANCHORING-MODES.md` for example profiles (Transparent Classic, Extreme Cost Saver, etc.).

About

This repository documents a complete, already-executed on-chain Proof of Concept (POC) for a Hydropower Measurement, Reporting, and Verification (MRV) system built on Hedera Hashgraph

Resources
 Readme
License
 Apache-2.0 license
 Activity
Stars
 0 stars
Watchers
 0 watching
Forks
 0 forks
Report repository


Releases
No releases published


Packages
No packages published



Languages
JavaScript
91.8%
 
TypeScript
8.2%
Footer
© 2026 GitHub, Inc.
Footer navigation
Terms
Privacy
Security
Status
Community
Docs
Contact
Manage cookies
Do not share my personal information