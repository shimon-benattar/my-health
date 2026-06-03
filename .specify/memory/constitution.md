<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized) → 1.0.0
Added principles: I. Spec-First, II. Type-Safe Pipeline, III. Idempotent Ingestion, IV. Free-Tier Compliance, V. Simplicity (YAGNI)
Added sections: Technology Stack, Development Workflow, Governance
Templates requiring updates:
  ✅ .specify/memory/constitution.md — this file (written from template)
  ✅ .specify/templates/plan-template.md — Constitution Check gates align (no edits needed; gates derive from this doc at plan-time)
  ✅ .specify/templates/spec-template.md — no structural changes required
  ✅ .specify/templates/tasks-template.md — no structural changes required
Follow-up TODOs: None. All placeholders resolved.
-->

# my-health Constitution

## Core Principles

### I. Spec-First (NON-NEGOTIABLE)

Every feature MUST follow the full spec-kit lifecycle before any implementation code is written:
**Constitution → Specify → Plan → Tasks → Implement → Checklist**

- No implementation file may be created until the relevant `spec.md` and `plan.md` have been reviewed and approved by the user.
- The spec-kit agents (`speckit.specify`, `speckit.plan`, `speckit.tasks`, `speckit.implement`) enforce this gate sequence.
- "Plan Mode" responses (architecture, data model, contracts) are presented for user approval and MUST NOT include runnable implementation code.

### II. Type-Safe Pipeline (NON-NEGOTIABLE)

All data flowing from CSV ingestion through parsing, validation, and persistence MUST pass through explicit TypeScript interfaces.

- The Mongoose schema in `lib/models/HealthEntry.ts` is the **single source of truth** for document shape.
- TypeScript `any` is forbidden in the data pipeline (`lib/parsers/`, `lib/models/`, `app/api/`).
- All parser functions MUST have typed inputs and typed return values.
- Parsed field types are defined in `types/health.ts` and imported by both the parser and the Mongoose model.

### III. Idempotent Ingestion (NON-NEGOTIABLE)

Uploading the same CSV file twice MUST produce an identical database state with no duplicate documents and no data loss.

- All health entry writes MUST use MongoDB `findOneAndUpdate` with `{ upsert: true }` matching on the unique `date` field.
- The `date` field MUST have a unique index on the MongoDB collection (`unique: true` in schema).
- The `$set` operator MUST overwrite all mutable fields on re-upload, ensuring stale records are corrected rather than duplicated.
- A re-upload producing zero net changes is a success condition, not an error.

### IV. Free-Tier Compliance

All architectural decisions MUST remain within the free-tier constraints of the declared infrastructure.

- **Vercel Free Tier**: Serverless function max execution time is 10 seconds; API routes processing large CSV uploads MUST stream or batch to stay within this limit.
- **MongoDB Atlas M0**: 512 MB storage cap; no aggregation pipeline stages that require disk (e.g., `$sort` with `allowDiskUse`). Keep indexes lean.
- No paid third-party services may be introduced without explicit user approval and constitution amendment.
- Deployment configuration (`vercel.json`, environment variables) MUST be version-controlled and documented.

### V. Simplicity (YAGNI)

This is a personal, single-user health dashboard. Features MUST NOT be over-engineered for scale, multi-tenancy, or hypothetical future requirements.

- No authentication system is required beyond environment-variable-gated access (if any).
- No background job queues, event buses, or microservice decomposition.
- Prefer a single Next.js API route over a dedicated backend service.
- Introduce abstractions only when the same logic appears in three or more places.
- Every added dependency must have a clear, immediate justification.

## Technology Stack

| Layer | Technology | Constraint |
|---|---|---|
| Framework | Next.js App Router (TypeScript) | v14+ with `app/` directory |
| Deployment | Vercel Free Tier | Max 10s serverless execution |
| Database | MongoDB Atlas M0 | 512 MB cap, free cluster |
| ODM | Mongoose | Schema-first; no raw driver calls in app code |
| CSV Parsing | papaparse | Client-side or server-side; typed with `PapaParseResult` |
| Language | TypeScript (strict mode) | `"strict": true` in `tsconfig.json` |
| Styling | Tailwind CSS | Utility-first; no CSS-in-JS libraries |

**Environment Variables** (MUST be set in Vercel dashboard and `.env.local`):
- `MONGODB_URI` — MongoDB Atlas connection string (never committed to source control)

## Development Workflow

The spec-kit workflow is enforced via `.specify/` configuration and `.github/agents/`:

1. **`speckit.constitution`** — Establish or amend project governance (this file).
2. **`speckit.specify`** — Define feature user stories and acceptance criteria (`spec.md`).
3. **`speckit.plan`** — Research, data model, and implementation architecture (`plan.md`).
4. **`speckit.tasks`** — Break plan into ordered, parallelizable tasks (`tasks.md`).
5. **`speckit.implement`** — Execute tasks one-by-one; each task ends with a passing test or linter check.
6. **`speckit.checklist`** — Gate review before PR merge; verify Constitution compliance.

**Git Branching**: Sequential branch numbering (`branch_numbering: sequential` in `init-options.json`). Feature branches follow `###-feature-name` convention.

**Auto-commit hooks** are enabled for all lifecycle phases (`extensions.yml`). Commits are made before and after each spec-kit phase transition.

## Governance

- This constitution supersedes all other conventions, inline comments, and README guidance. In case of conflict, this document wins.
- Any amendment requires: (1) documenting the change here with a version bump, (2) updating the Sync Impact Report comment, (3) propagating changes to dependent templates and agent files.
- Version bump rules:
  - **MAJOR**: Removal or redefinition of a NON-NEGOTIABLE principle.
  - **MINOR**: New principle or section added.
  - **PATCH**: Clarification, wording fix, or non-semantic refinement.
- All PRs MUST include a Constitution Check section in `plan.md` confirming compliance with Principles I–V.
- Complexity beyond YAGNI MUST be justified in the spec with explicit user approval before implementation.
- Runtime development guidance lives in `.specify/memory/` (this file and future `guidance.md` documents).

**Version**: 1.0.0 | **Ratified**: 2026-06-02 | **Last Amended**: 2026-06-02
