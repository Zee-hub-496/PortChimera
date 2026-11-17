# Spec 07: Dashboard and shipment management

## Goal
One place to see every shipment's state and drill into a unified view of its documents, customs data,
discrepancies, route, disruptions and history.

## Requirements

### R1. Shipments
1. THE user SHALL create, list and open their own shipments (number, origin and destination country and port, Incoterm).
2. THE API SHALL expose `GET /api/shipments`, `POST /api/shipments`, `GET /api/shipments/:id`, `PATCH /api/shipments/:id`, always scoped to the caller.

### R2. Derived status (Kanban)
1. THE board SHALL have columns: Submitted, AI Processing, Requires Review, AI Pre-Cleared, Cleared.
2. THE API SHALL derive status from data using the rules in `design.md`; users SHALL NOT drag cards freely between columns.
3. THE only manual transition SHALL be marking an `ai_pre_cleared` shipment as `cleared`, recorded in the audit log.
4. THE UI SHALL state that AI Pre-Cleared and Cleared are internal statuses and not customs authority decisions.

### R3. Shipment detail ("digital twin")
1. THE detail page SHALL have tabs: Overview, Documents, Customs, Discrepancies, Route, History.
2. EACH card on the board SHALL show: shipment number, parties, origin to destination, status, document progress (n of 3), open discrepancy count, duty estimate (or "not available"), route status.
3. WHEN an AI-generated item is shown THEN the UI SHALL show what was detected, supporting evidence, confidence, and whether human approval is pending.

### R4. Dashboard
1. THE dashboard SHALL show: total shipments, requiring review, open discrepancies, estimated duties (sum, labeled estimate), active disruptions, affected shipments, and recent activity.

### R5. Audit history
1. THE History tab SHALL list audit entries for the shipment in time order with action, actor and summary.

### R6. Pages
1. THE app SHALL have exactly these pages: Landing, Login, Dashboard, Shipments (board), Shipment detail, New shipment and upload, Route simulator.

### R7. Quality
1. THE UI SHALL be responsive, keyboard-usable, and label illustrative data.
2. THE UI SHALL show loading, empty and error states for every data view.
