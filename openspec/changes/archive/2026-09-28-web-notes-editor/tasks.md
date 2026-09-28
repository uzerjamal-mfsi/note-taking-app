# Tasks

## 1. Dependencies

- [x] 1.1 Add `@tiptap/react`, `@tiptap/starter-kit`, and `@tiptap/pm` to `apps/web/package.json` pinned at the exact version `2.26.1`, and verify `pnpm install --frozen-lockfile` succeeds with the lockfile updated.
- [x] 1.2 Add `apps/web/src/components/ui/alert-dialog.tsx` (shadcn pattern, built on the existing `radix-ui` dependency - no new npm package) and verify it renders/opens/closes in a minimal smoke test.

## 2. Notes and tags API functions

- [x] 2.1 Write `notes-api.test.ts` cases for `getNote(id)`, `createNote(content)`, `updateNote(id, { content, tagIds? })`, and `deleteNote(id)` (request URL/method/body, and successful-response parsing) before implementing them.
- [x] 2.2 Implement `getNote`, `createNote`, `updateNote`, and `deleteNote` in `apps/web/src/features/notes/api/notes-api.ts` using `apiFetch` and the existing `NoteDto`/`CreateNoteRequest`/`UpdateNoteRequest` types from `@note-taking-app/shared`, and verify the new tests from 2.1 pass.

## 3. Autosave hook

- [x] 3.1 Write `use-autosave.test.tsx` (Vitest, fake timers) covering: no save while idle timer hasn't elapsed; a single debounced save fires after the idle period; continued edits reset the idle timer and defer the save; save success reports a "saved" status; save failure reports an "error" status and preserves the pending content for the next attempt; a subsequent edit or explicit retry after a failure re-attempts the save; an immediate (non-debounced) save function is exposed for discrete actions like tag toggles; unmounting the hook while dirty triggers an immediate flush save; a `beforeunload` listener is registered only while dirty and removed once saved.
- [x] 3.2 Implement `useAutosave` in `apps/web/src/features/notes/hooks/use-autosave.ts`: idle-debounced trigger wrapping a TanStack Query mutation calling `updateNote`, exposing status (`idle` | `pending` | `saving` | `saved` | `error`), a manual retry function, and a `saveNow(partialUpdate)` function for immediate (non-debounced) saves. Add an unmount cleanup effect that flushes any pending save via `saveNow`, and a `beforeunload` effect (added/removed based on dirty state) that flushes best-effort and sets `event.returnValue` to trigger the browser's native confirmation. On mutation success, write the result into the query cache via `queryClient.setQueryData` rather than invalidating. Verify the tests from 3.1 pass.

## 4. Note editor page: load, title/body split, autosave wiring

- [x] 4.1 Write `NoteEditorPage.test.tsx` (React Testing Library) covering: loading state while `GET /notes/:id` is in flight; rendering the note's content into the body editor and its first-node text into the title input on success; not-found state on a `404` response; typing into the body updates its content and eventually triggers an autosave call; the save-status indicator reflects saving/saved/error; editing the title input updates the first node sent on the next autosave; editing the body (including its first visible line) leaves the title input's displayed value unchanged (one-way sync); clearing the title with an otherwise-empty body still autosaves a valid non-empty document.
- [x] 4.2 Implement `NoteEditorPage` in `apps/web/src/features/notes/components/NoteEditorPage.tsx` using `@tiptap/react`'s `useEditor`/`EditorContent` with `StarterKit` for the body, a plain controlled `<input>` above it for the title (one-way synced from title input to the document's first node per design.md - body edits never write back to the title), wired to `useAutosave`, with loading/not-found/error states and a save-status indicator built from existing UI primitives (`Alert`/text, no new toast system). Verify the tests from 4.1 pass.
- [x] 4.3 Add the `/notes/:id` route to `apps/web/src/routes/router.ts` under the existing `RequireAuth` guard, rendering `NoteEditorPage`, and verify `router.test.tsx`/route-guard tests cover an authenticated visit rendering the page and an unauthenticated visit redirecting to `/login`.

## 5. Editor/query refetch isolation

- [x] 5.1 Write a test asserting that when the underlying `GET /notes/:id` query data changes (simulating a background refetch) while the editor is mounted for the same note id, the editor's rendered content and title input are unchanged; and that navigating to a different note id re-seeds the editor from the new `GET /notes/:id` response.
- [x] 5.2 Implement seed-once-per-`noteId` initialization (an effect keyed on the route's `noteId` param that calls `editor.commands.setContent`/sets the title input exactly once per note, not on every query data change) in `NoteEditorPage`, and verify the tests from 5.1 pass.

## 6. Tag assignment

- [x] 6.1 Write a test for the editor's tag selector covering: renders the authenticated user's tags from `GET /tags` with the note's currently assigned tags shown as selected; toggling an unassigned tag immediately calls `updateNote` with the expanded `tagIds` set (no debounce wait); toggling an assigned tag immediately calls `updateNote` with it removed; a failed toggle shows an error and reverts the displayed selection; no tags renders no selector.
- [x] 6.2 Implement a tag selector in the editor (new component under `apps/web/src/features/notes/components/`, reusing `useTagsQuery` and the `NotesTagFilter`-style toggle UI) wired to `useAutosave`'s immediate `saveNow`. Verify the tests from 6.1 pass.

## 7. Delete note with confirmation

- [x] 7.1 Write a test for the delete action covering: activating it opens the confirmation dialog and sends no request yet; confirming sends `DELETE /notes/:id` and navigates to `/` on success; canceling/dismissing sends no request and leaves the editor open and unchanged; a failed delete shows an error and does not navigate.
- [x] 7.2 Implement the delete action in `NoteEditorPage` using the new `AlertDialog` component and `deleteNote`, navigating via `useNavigate` on success. Verify the tests from 7.1 pass.

## 8. Notes list navigation

- [x] 8.1 Update `NoteCard.test.tsx` to assert the card renders as a link to `/notes/:id` for its note, then update `NoteCard.tsx` to wrap its existing markup in a `react-router` `Link` to that route. Verify the updated test passes.
- [x] 8.2 Write a test for a "New note" action on `NotesListPage` (or an extracted small component) covering: activating it calls `createNote` with a minimal non-empty starter document and navigates to `/notes/:id` of the created note on success; it shows an error and does not navigate when `createNote` fails.
- [x] 8.3 Implement the "New note" action in `apps/web/src/features/notes/components/NotesListPage.tsx` (or a new small component under the same feature folder), wired to `createNote` and `useNavigate`. Verify the tests from 8.2 pass.

## 9. Verification

- [x] 9.1 Run `pnpm --filter web test --coverage` and confirm all notes-editor and notes-list tests pass with ≥80% coverage on the new code.
- [x] 9.2 Run `pnpm build` and `pnpm lint --max-warnings 0` and `pnpm run typecheck` from the repo root and confirm 0 errors/warnings.
- [x] 9.3 Run `openspec validate --strict` for the `web-notes-editor` change and confirm it passes cleanly.
