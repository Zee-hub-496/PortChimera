---
inclusion: fileMatch
fileMatchPattern: 'apps/api/**'
---

# API design

- REST under `/api`. Plural nouns, ids in the path: `/api/shipments/:id/documents`.
- Success: `{ "data": ... }`. Failure: `{ "error": { "code": "SOME_CODE", "message": "..." } }`.
- Status codes: 200 ok, 201 created, 202 accepted (background work), 400 bad input, 401 no/invalid token,
  403 not yours, 404 not found (also used when a resource belongs to someone else, to avoid confirming it exists),
  409 conflict, 413 too large, 422 semantically invalid, 429 rate limited, 500 unexpected.
- Validate every body, query and param with zod at the edge of the module. Reject unknown fields.
- Throw `AppError(status, code, message)` for expected failures; the central handler formats it.
  Unexpected errors return a generic 500; details are logged server-side only.
- Every route except `/api/health` requires a valid Supabase JWT and checks ownership of the shipment.
- Write an audit log entry (via the audit module) for every state-changing action.
- Rate limit globally; apply stricter limits to upload and AI routes.
