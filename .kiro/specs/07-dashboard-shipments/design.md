# Spec 07 design

## Status derivation (pure function in `packages/core/src/shipment/status.js`)

Input: documents (with `processing_status`), open discrepancies, HS suggestions, current stored status.

| Status | Rule (first match wins, top to bottom) |
|---|---|
| `cleared` | Stored status is already `cleared` (set manually; sticky) |
| `submitted` | No document has been sent for processing yet |
| `ai_processing` | Any document is `uploaded`-and-requested or `processing` |
| `requires_review` | Any document `extracted` but not `reviewed`; or any open discrepancy of severity medium or above; or any HS suggestion unapproved |
| `ai_pre_cleared` | All 3 documents `reviewed`, no open medium-or-higher discrepancy, no unapproved HS suggestion |

The API recomputes status after every relevant change (upload, process finished, review, cross-check, approval, discrepancy decision).
Computing it in one tested function avoids drift between the board and the detail page.
If the customs feature is cut, "no unapproved HS suggestion" is trivially true.

## Frontend structure

```
pages/            one file per page (7)
features/shipments/   ShipmentBoard, ShipmentCard, ShipmentTabs, hooks (useShipments)
features/documents/   UploadPanel, ExtractionReview
features/customs/     HsSuggestionList, DutyEstimate
features/discrepancies/  DiscrepancyTable
features/routes/      RouteForm, RouteResult, RouteMap, ScenarioPanel
components/       Button, Badge, Card, EmptyState, ErrorState, Spinner, Disclaimer
lib/              api.js, supabase.js, format.js
```

No business logic in components: they render what the API returns.

## Library choices

- Charts: Recharts only if a chart earns its place; start with number cards.
- Map: Leaflet + OpenStreetMap tiles (attribution required), with plain SVG as fallback if setup is slow.
- Kanban: columns rendered from data; no drag-and-drop library needed since moves are derived.

## Dashboard SQL

Single endpoint `GET /api/dashboard/summary` using aggregate queries through the user's client (RLS keeps counts personal).

## Risks

- Scope creep in UI polish. Build ugly-but-correct first; polish after the demo path works end to end.
