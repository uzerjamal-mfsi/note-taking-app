# Proposal

## Why

AB-1008: users have no way to let someone without an account read one of their notes. Sharing closes that gap with a minimal, revocable public-link mechanism, without opening editing or full account access to non-owners.

## What Changes

- Add a share-link lifecycle per note: an authenticated owner can generate a public link (`POST /notes/:id/share`), fetch its current state (`GET /notes/:id/share`), and revoke it (`DELETE /notes/:id/share`).
- A note has at most one active share link at a time. Generating again while one is active returns the existing link unchanged (idempotent); it does not rotate the token.
- Add an unauthenticated public read endpoint (`GET /shared/:token`) that returns only `title` and `content` for the linked note, and atomically increments a view counter on each successful read.
- Revoking a link deletes its record outright; the token immediately 404s and a later "generate" starts a fresh token with view count reset to `0`.
- Soft-deleting a note (existing `DELETE /notes/:id`) also deletes any active share link for that note, in the same transaction, so a shared-then-deleted note's public link 404s immediately.
- `POST /notes/:id/share` accepts an optional `expiresAt` (future-dated timestamp) when creating a new link; once a token expires, `GET /shared/:token` responds `404 Not Found` exactly like an unknown or revoked token, with no `viewCount` change.
- `GET /shared/:token` is protected by its own rate limit, separate from and stricter than the app-wide limiter, so the atomic view-count increment can't be used to amplify write load against a single popular or attacked token.
- Frontend is out of scope for this change; API only.

## Capabilities

### New Capabilities
- `notes-sharing`: generate/fetch/revoke a public share link for an owned note, and the unauthenticated public read endpoint that serves it and tracks view count.

### Modified Capabilities
(none — the existing `notes` capability's own request/response contracts for create/read/update/delete are unchanged; the delete-cascades-to-share-link behavior is a requirement of `notes-sharing`, not a change to `notes`.)

## Impact

- **Schema/migration**: new `SharedNote` model (1:1 with `Note`): `id`, `noteId` (unique FK), `token` (unique, opaque random string, not the note id), `viewCount` (default `0`), `expiresAt` (nullable, optional caller-supplied expiry), `createdAt`. New unique index on `token` for the public lookup path. Requires `prisma migrate dev`.
- **API (`apps/api`)**: new `apps/api/src/sharing/` feature (router, controller, service, repository) following the existing routes -> controllers -> services -> repositories layering; new router mounted in `apps/api/src/app.ts` alongside the notes router. `apps/api/src/notes/notes-service.ts`'s `deleteNote` gains a step to delete the note's `SharedNote` row inside its existing transaction/repository call. New env vars `SHARE_RATE_LIMIT_WINDOW_MS`/`SHARE_RATE_LIMIT_MAX` for a second, public-route-only rate limiter alongside the existing app-wide one.
- **Shared contracts (`packages/shared`)**: new Zod schemas/DTOs for the share-link response and the public shared-note response.
- **No changes** to `apps/web`, to existing `notes`/`notes-tags` request or response contracts, or to authentication.
- **Rollback**: dropping the new router/module and reverting the migration is sufficient; no existing data or endpoints are touched.
