# Design

## Context

Frontend-only change (see proposal.md). The `notes-sharing` API and its Zod contracts already exist; the web app has no sharing code, no `Dialog` primitive (only `alert-dialog`), and no public route. Observed constraints:

- `apiFetch` (`src/lib/api-client.ts`) always attaches the in-memory access token when present and, on any `401`, attempts a session refresh and retry. A public, unauthenticated request should do neither.
- All routes today sit under `RootLayout`, with authenticated routes behind `RequireAuth` and auth pages behind `RequireGuest`; `*` falls through to `NotFoundPage`.
- The editor stores the note title as the first paragraph of `content` (`note-content-split.ts`: `splitNoteContent` / `combineNoteContent`). `GET /shared/:token` returns both `title` and the full `content`, so the title appears twice unless the viewer drops the first block.
- The editor page is lazy-loaded to keep TipTap (~860kb) out of the main bundle (`routes/router.ts`).
- Existing data-layer pattern: thin functions in `features/<f>/api/*-api.ts` over `apiFetch`, wrapped by TanStack `useQuery`/`useMutation` hooks; no `fetch` in components.

## Goals / Non-Goals

**Goals:**
- Reuse existing patterns (api module + query hooks, shadcn primitives, `AlertDialog` for confirms) and add no npm dependency.
- Keep the public viewer isolated from the authenticated session (no token, no refresh, no guards).

**Non-Goals:**
- Any change to `apps/api`, `packages/shared`, the database, or API contracts.
- A page listing all shared notes across the account (needs a new endpoint; separate ticket).
- Editing the expiry of an existing link (the API is idempotent and ignores a new `expiresAt` for an active link; revoke and recreate is the path).
- Social/OG previews, SEO, or server-side rendering of the viewer.

## Decisions

### 1. Feature folder `features/sharing/`
`api/sharing-api.ts` (`getShareLink`, `createShareLink`, `revokeShareLink`, `getSharedNote`), `hooks/` (`useShareLinkQuery`, `useCreateShareLinkMutation`, `useRevokeShareLinkMutation`, `useSharedNoteQuery`), `components/ShareDialog.tsx`, `components/SharedNotePage.tsx`. Types come from `@note-taking-app/shared` (`ShareLinkDto`, `GenerateShareLinkRequest`, `SharedNotePublicDto`); nothing is redefined. The shared `generateShareLinkRequestSchema` is reused for client-side expiry validation so the "must be in the future" rule is not duplicated.
*Alternative:* put it under `features/notes/` - rejected; the project uses one folder per capability (`notes-search`, `tags`, `auth`).

### 2. `404` from `GET /notes/:id/share` is data, not an error
`getShareLink` catches a `NormalizedApiError` with `status === 404` and resolves `null`, so the query's `data` is `ShareLinkDto | null` and "not shared" is a normal render branch. All other errors propagate to `isError` and show the retry state. Query key `["notes", noteId, "share"]`. On every successful create or revoke, the mutation first `setQueryData`s the returned link / `null` (so the modal updates instantly) and then explicitly `invalidateQueries({ queryKey: ["notes", noteId, "share"] })` so the next read is confirmed by the server (e.g. the view count). Note: the key shares the `["notes"]` prefix, so the existing `invalidateQueries({ queryKey: ["notes"] })` after a note delete or save also matches it; that only refetches share queries that are currently mounted (the modal is closed otherwise, so none are), which is harmless.
*Alternative:* treat `404` as an error and branch on `error.status` in the component - rejected; it leaks into retry logic and `retry` defaults would re-send the 404.
The query disables retry for 404-as-null by construction (it never throws).

### 3. Query only runs while the modal is open
`useShareLinkQuery(noteId, { enabled: open })`, with `staleTime: 0` so each open revalidates (the view count changes server-side). Gating on `open` ensures the editor page makes no share request until the user asks, and none when the note failed to load.

### 4. Dialog primitive
Add `components/ui/dialog.tsx` (shadcn `Dialog` over `radix-ui`, matching `alert-dialog.tsx`'s structure and import style). Radix supplies focus trap, Esc, `aria-labelledby/describedby`, and focus return to the trigger, which satisfies the keyboard/ARIA conventions with no extra code. The revoke confirmation reuses the existing `AlertDialog`, nested inside the dialog's content.
*Alternative:* a custom modal - rejected; reinvents accessibility Radix already provides.

### 5. Public requests skip auth and refresh via an `apiFetch` option
Extend `ApiFetchOptions` with `skipAuth?: boolean`: when true, omit the `Authorization` header and skip the 401 refresh path (a public route never legitimately 401s). `getSharedNote` passes it. `credentials: "include"` is kept for a uniform fetch call; the `skipAuth` branch does not read the session store. Existing callers are unaffected (default `false`).
*Alternative:* call `fetch` directly in `sharing-api.ts` - rejected; duplicates base URL, JSON, and error normalization (and the project forbids ad-hoc fetch outside the api layer's shared client).

### 6. Share URL is built from the web origin
`${window.location.origin}/shared/${token}`, computed by a small pure helper (`buildShareUrl(origin, token)`) so it is testable without a DOM. The API origin is never used in the copied URL. The Vite dev server (:5173) and any static host both resolve `/shared/:token` through the SPA fallback; deployment config is already SPA-style for the existing deep link `/notes/:id`.

### 7. Copy to clipboard
`navigator.clipboard.writeText` inside a try/catch (rejection or missing API both handled; no empty catch - the failure sets visible state). On success show "Copied" in a `role="status"` region that resets after a short timeout (timer cleared on unmount). The URL stays in a read-only `Input` that selects its text on focus, which doubles as the manual-copy fallback.

### 8. Expiry input and validation
A native `<input type="datetime-local">` (wrapped by the existing `Input`/`Label`), value interpreted in the user's local zone and converted with `new Date(value).toISOString()` (always ISO 8601 in UTC, e.g. `...Z`) for `expiresAt`. The input carries a `min` attribute set to the current local date-time (formatted `YYYY-MM-DDTHH:mm`, recomputed each time the dialog opens) so the picker blocks past dates. `min` is only a browser hint (typed or pasted values bypass it, and minute truncation can still allow the current minute), so the submit-time check remains authoritative. Before sending, parse `{ expiresAt }` with `generateShareLinkRequestSchema`; a failure renders the schema's message inline and sends nothing. A server `422` maps to the same inline error. Empty input omits the key entirely.
*Alternative:* preset durations (1h/1d/7d/never) - simpler UX but narrower than the API and not what the ticket describes; can be added later without a contract change.

### 9. Public viewer renders read-only TipTap
`SharedNotePage` uses `useEditor({ editable: false, extensions: [StarterKit], content })` with `content = splitNoteContent(data.content).bodyContent` (drops the title paragraph) and renders `data.title` as an `<h1>`. This reuses the editor's extensions (`StarterKit`, the same schema as `NoteEditorPage`) so formatting matches what the author saw. Styling: `@tailwindcss/typography` is not installed and `prose` is used nowhere in the app, so the viewer wrapper gets hand-written Tailwind v4 utility/arbitrary-variant classes (e.g. `[&_h2]:text-xl`, `[&_ul]:list-disc`, `[&_blockquote]:border-l-2`, `[&_pre]:overflow-x-auto`) covering StarterKit's nodes (headings, lists, blockquote, code/code block, bold/italic/strike, horizontal rule). No new dependency. *Alternative:* add `@tailwindcss/typography` (pinned) for `prose` classes - rejected for now to honor "no new packages when existing patterns suffice"; revisit if rich-text styling is wanted app-wide. TipTap content is schema-validated by ProseMirror, so unknown nodes are dropped rather than interpreted as HTML. The page is lazy-loaded in `router.ts` alongside `NoteEditorPage` so TipTap stays out of the main bundle; the route is a sibling of the guarded groups, so neither `RequireAuth` nor `RequireGuest` runs.
*Alternative:* render the JSON to HTML with `generateHTML` + `dangerouslySetInnerHTML` - rejected; avoids raw HTML injection.
Error mapping in `SharedNotePage`: `404` → a dedicated "link unavailable" status page ("This link has expired or been revoked."), rendered in place with no retry and not routed through the router's `NotFoundPage`; `429` → "too many requests" state; anything else → generic error with retry. The API returns `404` for never-issued, revoked, expired, and deleted-note tokens by design (`notes-sharing` spec), and no backend change is in scope, so the page cannot say which one applies and its wording covers all of them.
`useSharedNoteQuery` sets `retry: false` for 404/429 (retrying a 429 worsens it and each success increments `viewCount`) and `refetchOnWindowFocus: false`, because every successful `GET /shared/:token` increments the owner's view count; a background refetch would inflate it.

### 10. Delete-note interplay
The API deletes the link when a note is soft-deleted. The delete flow already navigates away from the editor; on delete success the share query for that note is removed (`queryClient.removeQueries`) so no stale link is cached. (The query key is `["notes", noteId, "share"]`; see Decision 2.)

## Risks / Trade-offs

- **[Public viewer inflates view count on refetch/StrictMode double-fetch]** → `refetchOnWindowFocus: false`, `retry: false`, and a stable query key; in dev StrictMode may double-fetch once (accepted, dev only). Not mitigated further because the API owns counting.
- **[Copied URL 404s if the host lacks SPA fallback]** → Same requirement already exists for `/notes/:id` deep links; no new deployment assumption.
- **[Clipboard API needs a secure context]** → `localhost` and HTTPS qualify; the manual-copy fallback covers the rest.
- **[Stale view count in an open modal]** → Count is as of open/last refetch; the modal does not poll. Acceptable; reopening revalidates.
- **[`datetime-local` precision/locale differences across browsers]** → Validate through the shared schema after conversion; invalid/empty values surface the inline error or omit `expiresAt`.
- **[Nested dialog focus handling (AlertDialog inside Dialog)]** → Radix supports stacked layers; covered by a test that confirms Esc closes only the confirmation and focus returns to "Revoke link".
