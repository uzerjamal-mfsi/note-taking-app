# Design

## Context

See [proposal.md](./proposal.md) for motivation. Relevant existing state:
- `Note` (`packages/db/prisma/schema.prisma`) has `id`, `userId`, `title`, `content` (Json), `deletedAt`, timestamps, and is soft-deleted only (never physically removed within retention).
- `notes` feature (`apps/api/src/notes/`) follows router -> controller -> service -> repository, with `NotesService.deleteNote` calling `repository.softDeleteOwned(id, userId)`, and `AppError(code, status, message)` for typed errors via central error middleware.
- `packages/shared/src/notes/note-contracts.ts` holds Zod schemas/DTOs consumed by both `apps/api` and (eventually) `apps/web`.
- Global rate limiting and security headers already apply to every route (`api-app-shell` spec), so the new public endpoint needs no bespoke throttling.
- No existing precedent for an unauthenticated route; every current router mounts behind `requireAuth`.

## Goals / Non-Goals

**Goals:**
- One active share link per note, cheap to look up by token, safe under concurrent view increments.
- Reuse the existing layering and error-handling conventions rather than introducing a parallel style for this feature.
- Keep the public read path minimal: no auth middleware, no leakage of anything beyond `title`/`content`.
- Support an optional, owner-supplied expiry on a share link, enforced independently at every read path (not just at generation time).
- Bound the public read endpoint's request rate independently of the app-wide limiter, since it is the one route whose every hit performs a database write (the view-count increment).

**Non-Goals:**
- Frontend UI (Share button, public note view page) — deferred, per proposal.
- Multiple simultaneous links or per-link access scoping — not requested by AB-1008.
- Extending or rotating an existing link's expiry after creation — a caller who wants a different expiry revokes and regenerates.
- A background job to purge expired or revoked `SharedNote` rows — out of scope; expired rows are inert (never served) and get replaced in place the next time `POST /notes/:id/share` is called for that note.

## Decisions

### New `sharing` feature module, own router mounted unauthenticated
`apps/api/src/sharing/` gets its own `sharing-router.ts` / `-controller.ts` / `-service.ts` / `-repository.ts`, mirroring `apps/api/src/notes/`. Two routers are created from it and mounted in `app.ts`:
- an owner router carrying `/notes/:id/share` (mounted behind the same `requireAuth` used for notes), and
- a public router carrying `/shared/:token` (mounted with no auth middleware).
Splitting by mount point rather than bolting `/shared/:token` onto the existing notes router keeps "requires auth" a property of the whole router, matching how every other route is wired today, instead of introducing a per-route auth toggle.

**Alternative considered:** add `/shared/:token` to `notes-router.ts` directly. Rejected — it would be the only unauthenticated route mixed into an otherwise fully-authenticated router, easy to miss in review and easy to accidentally guard later.

### `SharedNote` as its own table, not columns on `Note`
Matches the exploration decision: 1:1 model with `noteId` (unique FK), `token` (unique), `viewCount` (default `0`), `expiresAt` (nullable), `createdAt`. Isolates sharing concerns from the core note model (mirrors the existing `Tag`/`NoteTag` split), and means every note read that isn't share-related pays zero extra columns.

### Optional link expiry (`expiresAt`)
`SharedNote.expiresAt` is a nullable `DateTime`, set only at creation from an optional `expiresAt` field on the `POST /notes/:id/share` request body (Zod: `z.string().datetime()` refined to be strictly after `new Date()` at validation time), and never updated afterwards — there is no "extend" or "rotate expiry" operation in this change; a caller who wants a different expiry revokes and regenerates. "Active" is defined once, in the service layer, as: a `SharedNote` row exists for the note **and** (`expiresAt` is `null` **or** `expiresAt > now()`). Every operation (generate's idempotency check, owner fetch, owner revoke, and the public read) consults this same definition so an expired row behaves identically to a missing one everywhere except that generating a new link on an expired note replaces (deletes, then creates - or an upsert in the repository) the stale row rather than hitting the `noteId` unique constraint.

**Alternative considered:** accept `expiresInSeconds` (a duration) instead of an absolute `expiresAt`. Rejected in favor of matching the column name 1:1 with the request field, which keeps the contract and storage in lockstep and avoids a service-layer "now + duration" computation whose result then has to be re-derived for every response anyway.

### Token generation and lookup
`token` is generated with `node:crypto.randomBytes(32).toString("base64url")` (43 chars, URL-safe, no padding) — same standard-library primitive already available, no new dependency, satisfies "Reference existing patterns before introducing new npm packages." It is stored in its own unique-indexed column so `GET /shared/:token` is a single indexed lookup, and is never derived from or equal to `noteId` so a note's id doesn't double as a guessable capability token.

### Atomic view count via Prisma's native increment, guarded by a defensive query condition
The public read is two queries, both run inside one `prisma.$transaction(async (tx) => ...)`, in this order:
1. `tx.sharedNote.updateMany({ where: { token, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], note: { deletedAt: null } }, data: { viewCount: { increment: 1 } } })` — compiles to a single `UPDATE ... SET "viewCount" = "viewCount" + 1 WHERE ...` guarded by the token, expiry, and the note's `deletedAt` all in the same statement. `updateMany` (rather than `update`) is required because the `WHERE` clause combines the unique `token` with non-unique conditions. This is atomic at the database level with no read-modify-write race, and no raw SQL needed (consistent with the "no raw SQL except parameterized `$queryRaw`" rule, which this avoids entirely). A `count` of `0` means "not servable" (unknown token, expired, or note soft-deleted) and the handler responds `404` without proceeding to step 2.
2. Only when step 1 reports `count: 1`, a `tx.sharedNote.findUnique`-through-relation read of the note's `title`/`content` to build the response body.

Both steps run in the same transaction (not two independent queries) so a concurrent revoke or note-delete can't land between the increment and the read: `updateMany`'s write takes a row lock on the matched `SharedNote` row that a concurrent `DELETE` on that same row must wait on, so no other transaction can remove the row until this one commits, guaranteeing step 2 always finds what step 1 just updated. Without this, a revoke racing between the two steps could increment `viewCount` for a view whose content was never actually returned to the caller (a 404 despite the row having existed a moment earlier).

Folding `expiresAt` and the note's `deletedAt` into step 1's `WHERE` clause (rather than checking them in a separate `SELECT` beforehand) means the "is this link servable" check and the increment happen as one atomic operation: there's no window between checking and incrementing where the link could expire or its note could be deleted out from under a plain two-step check-then-act. Checking `note.deletedAt` here is deliberately redundant with the delete-cascade in "Soft-delete cascade" below: it's defense-in-depth against any future code path that soft-deletes a note without going through `NotesService.deleteNote`, so the public endpoint's own guarantee never depends on that cascade having run correctly.

### Revoke = hard delete of the `SharedNote` row; generate-while-active = idempotent no-op; generate-while-expired = replace
Revoke and idempotent-while-active were decided in exploration. Revoke calls `prisma.sharedNote.delete(...)` and 404s if the row is missing *or* already expired (expired is "not active", so there is nothing to revoke via this endpoint - the row is simply overwritten on the next generate). Generate first checks for an existing row (`findUnique` by `noteId`): if none exists, or the existing one has expired, it creates a fresh row (deleting the expired one first, in a transaction, to satisfy the `noteId` unique constraint); if an active one exists, it returns that row as-is. No token rotation or expiry-extension endpoint exists in this change.

### Soft-delete cascade handled in `NotesService.deleteNote`, not a DB-level cascade
Because notes are soft-deleted (an `UPDATE`, not a `DELETE`), Prisma's `onDelete` FK actions never fire. `NotesService.deleteNote` is extended to also delete the note's `SharedNote` row (if any) inside the same repository call that performs the soft-delete, using `prisma.$transaction([...])` so both writes commit together (matching the existing transaction usage in `notes-repository.ts` and `tags-service.ts`). A `SharedNote.noteId` foreign key with `onDelete: Cascade` is still declared for referential-integrity safety, but the application path is what makes the 404 immediate.

### Per-route rate limiting on the public endpoint via a second `express-rate-limit` instance
`app.ts` already applies one global `rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX })` ahead of all routes. This change adds a second instance, mounted only on the public `sharing` router in front of `GET /shared/:token`, configured from two new env vars following the existing naming convention: `SHARE_RATE_LIMIT_WINDOW_MS` / `SHARE_RATE_LIMIT_MAX` (parsed in `apps/api/src/config/env.ts` the same way as `RATE_LIMIT_WINDOW_MS`/`RATE_LIMIT_MAX`, with a default tighter than the global one). Reusing `express-rate-limit` (already a dependency, per "Reference existing patterns before introducing new npm packages") rather than adding a token-bucket library or per-token in-memory counter keeps this consistent with the one rate-limiting mechanism the codebase already has; a request over this route's limit is rejected before it reaches the controller, so it never touches the `viewCount` increment.

**Alternative considered:** key the per-route limiter by `:token` instead of by IP (matching `express-rate-limit`'s default), to bound abuse of one specific token rather than one caller. Rejected for this change - the default IP-keyed limiter already satisfies the stated goal (bounding write-amplification per caller) with zero additional code, and a token-keyed limiter would need its own store key strategy that isn't otherwise motivated here.

### Public DTO excludes everything but `title`/`content`
`packages/shared/src/sharing/sharing-contracts.ts` defines a `sharedNotePublicDtoSchema` distinct from `noteDtoSchema` (which carries `id`, timestamps, `tags`) — a new schema rather than `.pick()` from the note DTO, so a future field added to `noteDtoSchema` doesn't silently leak into the public response.

## Risks / Trade-offs

- **[Risk]** An owner-side `GET /notes/:id/share` 404 (no active link) and a not-found note both surface identically to a caller probing note ids that aren't theirs → **Mitigation:** matches the existing pattern in `notes` (`GET /notes/:id` already collapses "not yours" and "deleted" into a single 404), so this is consistent rather than novel.
- **[Risk]** `randomBytes(32)` read from `node:crypto` is blocking-but-fast; negligible at this endpoint's expected volume → **Mitigation:** none needed; flagging only because it's a new call site in this codebase.
- **[Trade-off]** No per-viewer scoping means a leaked link stays valid until it expires or the owner revokes it → accepted, out of scope per proposal; expiry and revoke are the only mitigations offered.
- **[Risk]** An IP-keyed rate limit on `GET /shared/:token` can be shared unfairly by many legitimate visitors behind the same NAT/corporate egress IP, or bypassed by a distributed attacker rotating source IPs → **Mitigation:** accepted as the same trade-off the existing global limiter already makes; no new mitigation introduced in this change beyond what "Alternative considered" in the rate-limiting decision already weighs.
- **[Risk]** An expired `SharedNote` row is never proactively deleted, only replaced the next time `POST /notes/:id/share` runs for that note → **Mitigation:** accepted; the row is inert (every read path treats it as not-active) so it costs storage, not correctness, and a background purge job can be added later without a spec change if row growth becomes a concern.

## Migration Plan

1. Add `SharedNote` model (including `expiresAt`) to `schema.prisma`, run `prisma migrate dev` to generate the migration (no hand-edited SQL needed — no functional/partial index like the `Note`/`Tag` ones).
2. Add the two new `SHARE_RATE_LIMIT_*` env vars to `apps/api/src/config/env.ts` and `.env.example`.
3. Add `packages/shared` contracts (including `expiresAt` on both request and response schemas), then the `apps/api/src/sharing/` module (repository, service, controller, both routers, the second rate limiter), then mount both routers in `app.ts`.
4. Extend `NotesService.deleteNote` for the cascade.
5. No data backfill required (new table, no existing rows). Rollback is dropping the migration and the new module/router mounts; no existing endpoint's contract changes.
