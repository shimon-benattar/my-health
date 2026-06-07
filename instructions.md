# Engineering Instructions

## Test Strategy (Risk-Based, Not Blanket Full Coverage)

- Do not require 100% coverage for every change.
- Every bug fix must include at least one regression test that fails before the fix and passes after.
- Prioritize tests for:
  - API routes with validation, parsing, and external integrations.
  - Data import and transformation logic.
  - Security-sensitive and error-handling paths.
- For UI-only copy/style tweaks, add tests only when behavior changes.
- Keep tests focused, deterministic, and fast.

## Minimum Expectations Per Change

- Behavior change in API/business logic: add or update unit/API tests.
- New endpoint: add success case + at least one invalid input case.
- External service flow (Blob/DB/network): add failure-path tests and verify user-facing error shape.

## Error Handling and Observability

- Return stable error payloads for APIs: `{ error, code, requestId }` where applicable.
- Log server failures with a request identifier and sanitized details.
- Never leak secrets (tokens, connection strings) in responses or logs.

## CI Quality Gate

- `npm test` must pass.
- `npm run build` must pass.
- Coverage should trend up over time, but do not block small low-risk changes solely on coverage percentage.
