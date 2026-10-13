# 0004. Shared Zod contracts package

Status: Accepted.

## Context

The API and SPA exchange JSON. Duplicated types or validators drift; `CLAUDE.md` forbids duplicating TypeScript types or Zod schemas between frontend and backend.

## Decision

`packages/shared` is the single source of request/response contracts: Zod schemas and inferred types per feature (auth, notes, notes-search, notes-history, tags, sharing, error response). The API validates with them through `validate()` (`apps/api/src/middleware/validate.ts`), the web imports DTO types, and OpenAPI is generated from the same schemas (`apps/api/src/docs/openapi.ts`). `openspec/config.yaml` requires new designs to define schemas in `packages/shared` first.

## Consequences

- One definition of each contract; changes are compile-time visible to both apps.
- The package exports raw `.ts`, so consumers need a TS-aware runtime (`tsx` in the API container).
- Contracts are not automatically enforced on responses: controllers build DTOs by hand and rely on type checks and casts, and some route params are not validated (SDS section 11).
- OpenAPI currently covers only a subset of the contracts.
