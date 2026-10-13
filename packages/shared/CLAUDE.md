# packages/shared — scoped rules (root CLAUDE.md still applies)

- Single source of truth for Zod schemas, inferred DTO types, and error codes used by api and web. Layout: `src/<feature>/`, re-exported from `src/index.ts`.
- Derive types with `z.infer`; never hand-write a type a schema already describes.
- Runtime dependency: `zod` only. Never import from `apps/api`, `apps/web`, `@note-taking-app/db`, or Prisma; code must run in both Node and the browser (no Node-only or DOM-only APIs).
- Schemas are API contracts: changing a field, status, or error code is a breaking change that needs an OpenSpec change and both consumers updated in the same PR.
- Input schemas are strict (trim, min/max lengths, reject unknown keys where required). Response DTO schemas must not expose internals such as `deletedAt`, password hashes, or token data.
- Consumers import from `@note-taking-app/shared` only (no deep paths); export new schemas via `src/index.ts`.
- Tests: Vitest beside the schema covering valid, invalid, boundary, and unknown-key cases.
- Run: `pnpm --filter @note-taking-app/shared test` and `pnpm run typecheck`.
