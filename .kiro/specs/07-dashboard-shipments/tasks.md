# Spec 07 tasks

- [ ] 1. `deriveShipmentStatus` in core + table-driven tests for every row of the rule table (R2)
- [-] 2. Shipment CRUD endpoints with ownership, validation, audit (R1)
  - Create, list and get are written; logic tested with fakes (Alice and Bob isolation, 409, 422, audit). Express wiring not run. No update or delete.
- [ ] 3. Status recomputation hook called from document, discrepancy and approval services (R2.2)
- [ ] 4. Manual "mark cleared" endpoint, only from `ai_pre_cleared` + test (R2.3)
- [ ] 5. `GET /api/shipments/:id` returning the unified view (documents, items, discrepancies, routes, audit) (R3)
- [ ] 6. `GET /api/dashboard/summary` + test with two users to prove counts are personal (R4)
- [-] 7. Web: shared components with loading, empty and error states (R7)
  - Shared Card, Badge, Skeleton, EmptyState and ErrorState written in the UI redesign. Not built or rendered.
  - `MaritimeMap` (Leaflet) is written, not run. It has no automated test; manual map checks are in `docs/MILESTONE_UI.md`.
- [-] 8. Web: New shipment + upload page (R6)
  - Only the new shipment form and list are written (`Shipments.jsx`); form validation is tested. No upload yet. Page not run.
- [ ] 9. Web: Kanban board and cards (R2, R3.2)
- [ ] 10. Web: shipment detail tabs, History tab (R3, R5)
- [-] 11. Web: dashboard cards (R4)
  - `Dashboard.jsx` written from existing list APIs (no summary endpoint). Page not run.
- [-] 12. Responsive and keyboard pass; disclaimers present (R2.4, R7)
  - Responsive layout, skip link and focus styles written. Not checked in a browser.
