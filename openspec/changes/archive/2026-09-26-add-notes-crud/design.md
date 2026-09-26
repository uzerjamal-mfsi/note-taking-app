# Design

## Context

See proposal.md - Why/What Changes for motivation and scope. Relevant existing state:

- `apps/api/src/middleware/require-auth.ts` verifies the access token and sets `req.user = { id }` — notes routes reuse this unchanged.
- The existing `auth` module (`apps/api/src/auth/*`, `apps/api/src/routes/auth-router.ts`) wires router -> service, with the service calling Prisma directly (no separate controller or repository file, except `refresh-token-repository.ts`). CLAUDE.md mandates routes -> controllers -> services -> repositories for new code; notes will follow that layering even though it doesn't match auth's existing shape (see Decisions).
- `packages/shared/src/auth/auth-contracts.ts` is the existing pattern for Zod request/DTO schemas re-exported from `packages/shared/src/index.ts`.
- `packages/db/prisma/schema.prisma` has no `Note` model yet; this change adds one plus a migration.

## Goals / Non-Goals

**Goals:**
- Define the `Note` schema, migration, and index.
- Define the layering and file structure for the notes module.
- Define exactly how `title` is derived from a TipTap/ProseMirror `content` document, since that logic doesn't exist anywhere in the codebase yet.

**Non-Goals:**
- Pagination, sorting, tag filtering, restore/trash, full-text search, sharing, version history — all deferred per proposal.md.
- Any change to auth, session, or existing user endpoints.

## Decisions

### Layering: full routes -> controller -> service -> repository
CLAUDE.md requires this layering for backend code; the existing auth module predates it and collapses service+repository. Rather than propagate the shortcut, notes gets:
- `apps/api/src/notes/notes-router.ts` — route definitions, `validate()` middleware, `requireAuth`, calls controller.
- `apps/api/src/notes/notes-controller.ts` — request/response mapping (extract `req.user.id`, `req.params.id`, `req.body`; map service result to `NoteDto`; set status codes).
- `apps/api/src/notes/notes-service.ts` — business logic: title derivation, ownership checks, orchestrating repository calls.
- `apps/api/src/notes/notes-repository.ts` — the only file that touches `prisma.note`.
- **Alternative considered**: mirror auth's router->service shape for consistency with existing code. Rejected because CLAUDE.md's layering rule is the documented standard going forward, and auth's shape is legacy, not precedent to extend.

### Title extraction from TipTap content
`content` is an arbitrary ProseMirror JSON document (`{ type: "doc", content: [...] }`). The service extracts the title by:
1. Taking `content.content[0]` (the first top-level node).
2. Recursively concatenating the `text` field of that node and its descendants (depth-first), ignoring node/mark types.
3. Trimming whitespace and truncating to 120 characters.
4. If the result is empty (no node, no text, or whitespace-only), `title` is `"Untitled"`.

This lives in `notes-service.ts` as a pure function (e.g. `deriveTitle(content: unknown): string`) so it's independently unit-testable without a database. No new npm package is needed — it's a small tree-walk over parsed JSON.

### Content validation depth
`packages/shared`'s `content` Zod schema validates only the minimal ProseMirror-doc shape needed for title derivation and safe storage: `z.object({ type: z.literal("doc"), content: z.array(z.record(z.unknown())).min(1) })`. It does not validate the full TipTap node/mark grammar (node types, marks, attrs) — that grammar isn't owned by this change and over-validating here would need updating whenever the editor's schema evolves. `content` overall SHALL NOT be empty, per the requirement.
- **Alternative considered**: store `content` as `z.record(z.unknown())` with no shape check at all. Rejected because title derivation and emptiness validation both need at least one node to look at, and a totally-unshaped blob makes both scenarios ("missing content" vs "malformed content") unreliable to test.

### Bounded content nesting depth
The minimal shape schema above accepts arbitrarily deep `content` trees, which is a real cost/DoS surface: a deeply nested document is expensive to store, to walk during title extraction, and (later) to render. The schema adds a `superRefine` that walks the parsed `content` value and rejects it once nesting exceeds `MAX_CONTENT_DEPTH = 50`, exported as a named constant from `packages/shared/src/notes/note-contracts.ts` so the limit is documented in one place and reusable by tests.
- `MAX_CONTENT_DEPTH = 50` is a judgment call: generous enough that no realistic hand-authored or pasted document should hit it, small enough to bound worst-case walk cost. See Risks.
- The depth check runs as a single explicit tree walk in the `superRefine`, not via `z.lazy()` recursion with no bound — a schema-level recursive definition has no natural place to enforce a *maximum*, only to describe valid shape, so the depth limit is enforced procedurally against the already-parsed `z.record(z.unknown())` nodes.
- **Alternative considered**: rely on Node's default JSON.parse stack limits to implicitly cap depth. Rejected because that failure mode is an uncaught engine error, not a controlled `422 Unprocessable Entity` via the existing `validate()` middleware.

### Ownership + not-found handling
`notes-repository.ts` queries always filter by `{ id, userId, deletedAt: null }`. A `findFirst`/`update` that matches zero rows (wrong owner, wrong id, or already-deleted) is indistinguishable at the repository level from "doesn't exist" — the service turns a null/zero-row result into a single `AppError("NOTE_NOT_FOUND", 404, ...)` for `GET`/`PATCH`/`DELETE`, satisfying the spec's no-existence-leak requirement without a separate ownership check + 403 path.

### Index strategy: partial composite index on (userId) WHERE deletedAt IS NULL
Every notes query (`findOwned`, `listOwned`, `updateOwned`, `softDeleteOwned`) filters by exactly `{ userId, deletedAt: null }`. Prisma's schema DSL has no syntax for a partial (`WHERE`-qualified) index, so:
1. `schema.prisma` declares `@@index([userId, deletedAt])` — the closest Prisma-representable form, and enough on its own to avoid a full table scan.
2. The migration is generated with `prisma migrate dev --create-only --name add_note`, then the generated `CREATE INDEX` statement in the resulting `migration.sql` is hand-edited to a true partial index: `CREATE INDEX "Note_userId_active_idx" ON "Note"("userId") WHERE "deletedAt" IS NULL;`. The migration is only edited before it is ever applied — CLAUDE.md's "never edit an applied migration" rule is about migrations already run against a database, not this one-time authoring step.
3. `prisma migrate dev` is then run (without `--create-only`) to apply it.
- **Alternative considered**: ship the plain composite index and skip the partial-index hand-edit. Rejected because the composite index still carries an entry for every soft-deleted row forever, growing unboundedly relative to the working set the app actually queries (active notes), where a partial index stays proportional to it.
- **Alternative considered**: add `deletedAt` to every repository `select`/`where` via a raw `$queryRaw` to hint the planner. Rejected as unnecessary — a correct index makes the ORM-generated query fast without dropping to raw SQL.

### Response mapping and status codes
`notes-controller.ts` maps the Prisma row to `NoteDto` (`id`, `title`, `content`, `createdAt`, `updatedAt`) — `userId` and `deletedAt` are never serialized to the client, consistent with "never return raw Prisma models." Status codes, pinned explicitly so nothing is left to per-route judgment:

| Route | Success | Validation failure | Unauthenticated | Not found / not owned / deleted |
|---|---|---|---|---|
| `POST /notes` | `201 Created` | `422 Unprocessable Entity` | `401 Unauthorized` | n/a |
| `GET /notes` | `200 OK` | n/a | `401 Unauthorized` | n/a |
| `GET /notes/:id` | `200 OK` | n/a | `401 Unauthorized` | `404 Not Found` |
| `PATCH /notes/:id` | `200 OK` | `422 Unprocessable Entity` | `401 Unauthorized` | `404 Not Found` |
| `DELETE /notes/:id` | `204 No Content` (empty body) | n/a | `401 Unauthorized` | `404 Not Found` |

`204 No Content` for delete matches the existing `POST /auth/logout` convention (`apps/api/src/routes/auth-router.ts`), which also returns an empty body on successful state-changing-with-nothing-to-return actions. `422 Unprocessable Entity` (code `VALIDATION_FAILED`) for validation failure matches every existing route's use of the shared `validate()` middleware (`apps/api/src/middleware/validate.ts`) — notes reuses that middleware unchanged rather than introducing a `400`-based path found nowhere else in the codebase.

## Risks / Trade-offs

- **[Risk]** A `content` document with deeply nested or very large trees makes title extraction (and JSONB storage) more expensive than a flat string. → **Mitigation**: extraction only walks until it finds text in the first top-level node (bounded by that node's own size, not the whole document); no size cap on `content` itself is introduced in this change since none was requested, but the recursive walk is depth-first with early exit on first non-empty text found.
- **[Risk]** The minimal `content` Zod schema will pass genuinely malformed-but-shaped-like-a-doc payloads (e.g. nodes with no recognized TipTap `type`) since full grammar isn't validated. → **Mitigation**: acceptable for this change since there's no UI yet and no downstream consumer of `type`-specific rendering; revisit if/when a stricter TipTap-schema-aware validator is needed.
- **[Risk]** Diverging from auth's router->service shape means the codebase now has two different layering styles. → **Mitigation**: CLAUDE.md's layering is the documented target; a future cleanup of auth is out of scope here and not blocked by this change.
- **[Risk]** `MAX_CONTENT_DEPTH = 50` is a judgment call with no product input behind the exact number; a legitimate deeply-nested document (e.g. many levels of nested lists/blockquotes) could be rejected. → **Mitigation**: the limit is a single named, exported constant, easy to raise later without a spec or API-shape change if real usage hits it; the spec only requires *some* fixed maximum, not this specific value.
- **[Risk]** Because Prisma's schema DSL cannot express the partial index actually created in the database (`WHERE "deletedAt" IS NULL`), `schema.prisma` declares the closest representable approximation (`@@index([userId, deletedAt])`), which does not match the real index. Every future `prisma migrate dev` (including the `pnpm run db:migrate` script) will detect this as schema drift and interactively offer to generate a "fixup" migration. → **Mitigation**: documented directly above the `@@index` in `schema.prisma`. Accepting that prompt would silently replace the partial index with a plain composite one and must never be done — cancel the prompt instead. `prisma migrate status` and `prisma migrate deploy` (used in CI/prod) are unaffected; only the interactive `migrate dev` drift check is.

## Migration Plan

1. Add `Note` model to `packages/db/prisma/schema.prisma` with `@@index([userId, deletedAt])`.
2. Run `prisma migrate dev --create-only --name add_note`, hand-edit the generated SQL into a partial index, then run `prisma migrate dev` to apply it (see Index strategy decision above).
3. Add Zod schemas to `packages/shared`, then the four-layer `apps/api/src/notes/*` module, then wire `createNotesRouter` into `app.ts` behind `requireAuth`.
4. Rollback: drop the migration (`prisma migrate resolve` back, or a generated down migration) and revert the code changes; the `Note` table is additive with no foreign keys pointing into it from other tables, so no other capability is affected.
