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

## MVP scope (17-day, solo build)

Must: login, shipments, upload 3 documents, Gemini extraction with review, cross-check,
A* routing (fastest/cheapest/lowest-risk), per-user disruption scenarios, Kanban + shipment detail.
Should: HS suggestion and duty estimate for ~20 curated Pakistan codes, audit log.
Out of scope: OCR (Tesseract), live shipping data, other customs jurisdictions, multiple
alternative routes, a separate crisis analytics page.

Seven pages: Landing, Login, Dashboard, Shipments (Kanban), Shipment detail, New shipment/upload, Route simulator.

## Working agreement

- Do not claim a feature is done until it is built and tested.
- Explain engineering decisions in plain language; the author is a student learning from this project.
- Ask before major architecture changes. Protect the demo path above all extra features.
