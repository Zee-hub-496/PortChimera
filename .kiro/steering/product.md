---
inclusion: always
---

# PortChimera: product goals

PortChimera is a customs and crisis-logistics platform built for Kiroween 2026 (Frankenstein
category). The "chimera" is three different kinds of technology working as one system:

1. **AI (Gemini)** reads messy documents and suggests classifications.
2. **Deterministic code** validates, compares and calculates. It is the source of truth.
3. **A\* search** picks shipping routes and re-plans them when a port is disrupted.

## Rules that define the product

- AI output is a suggestion, never a verified fact. Humans approve HS codes and discrepancy decisions.
- Never let the AI calculate money. Duty math is deterministic code over cited tariff rows.
- Never invent data. Missing values are marked `missing`; unknown tariffs show "cannot verify".
- Simulated or illustrative data (ports, freight costs, exchange rates) is always labeled as such in the UI and the database.
- "AI Pre-Cleared" is an internal status. It must never imply government customs approval.
- Say "possible inconsistency" and "requires manual verification". Never say "fraud".

## Scope for the Kiroween sprint (deadline Dec 4, 2026, 2:00 PM PT)

The day-by-day plan is `docs/PORTCHIMERA_EXECUTION_PLAYBOOK.md`. If this file and the playbook
disagree, the playbook wins.

In scope: login, shipments, upload of the 3 documents, Gemini extraction with human review,
deterministic cross-check, shipment status derived from documents and discrepancies, audit log,
A* routing (fastest/cheapest/lowest-risk), and **crisis simulation**: per-user disruption scenarios
(close or reopen a port or lane) shown on the shipment route page with before/after routes.
Feature freeze after Nov 30.

Out of scope for this sprint: the customs / HS-code and duty module
(`.kiro/specs/03-customs-classification`), OCR (Tesseract), live shipping data, other customs
jurisdictions, real freight quotes, and a separate crisis analytics page.

Pages today: Landing, Login, Register, Dashboard, Shipments, Shipment detail (Overview, Documents,
Cross-check, Route tabs), Global Map, Documents, Alerts, Crisis monitor (all saved crises against all shipments), Settings. Do not add pages without the
owner's approval.

## Working agreement

- Do not claim a feature is done until it is built and tested.
- Explain engineering decisions in plain language; the author is a student learning from this project.
- Ask before major architecture changes. Protect the demo path above all extra features.
