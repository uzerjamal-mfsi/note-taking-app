# Design

## Context

Frontend-only change (see proposal.md). The `notes-history` API and its Zod contracts (`NoteVersionSummaryDto`, `NoteVersionDto`) already exist; the web app has no history code and no side-sheet primitive (only `dialog` and `alert-dialog`). Observed constraints:

- `NoteEditorPage` owns the editor state: a TipTap instance for the body, `titleText`/`titleRef` for the title input, and `tagIds`. It seeds all three once per note, guarded by `seededNoteIdRef`, inside an effect that calls `editor.commands.setContent(body, false)`. There is no reusable seed function.
- `useAutosave` keeps pending content in refs and exposes `scheduleSave`, `saveNow`, `retry`, `cancelPendingSave`. The internal `flush()` only sends when the dirty flag is set and serializes against an in-flight save, but it is not exported. `saveNow()` marks dirty unconditionally, so it can re-send already-saved content.
- A successful autosave writes the response into the `["note", noteId]` cache. The share link query key is `["notes", noteId, "share"]`, so `invalidateQueries(["notes"])` also matches mounted share (and, here, history) queries; this is harmless.
- The note title is the first node of `content` (`note-content-split.ts`). A version's `content` therefore contains the title as its first node, and `title` is also returned separately.
- The restore endpoint returns the full `NoteDto` (same shape as `PATCH`), including `tags`.
- `ShareDialog` is the reference pattern: a self-contained component that owns its trigger button and open state and gates its query on `open`.

## Goals / Non-Goals

**Goals:**
- Reuse existing patterns (api module + query hooks, `radix-ui` primitives, `ShareDialog` composition) with no new npm dependency.
- Make restore race-free against autosave: no pre-restore content may ever be written after a restore, and no unsaved typing may be lost.

**Non-Goals:**
- Any change to `apps/api`, `packages/shared`, the database, or API contracts.
- Diffing versions, naming/pinning versions, deleting versions, or restoring tags (the API restores `content` only; see Risks).
- Pagination of versions (the API returns the full list, bounded by the 30-day purge).
- Making the drawer a general reusable layout component beyond what this feature needs.

## Decisions

### 1. Feature folder `features/notes-history/`
`api/notes-history-api.ts` (`listNoteVersions`, `getNoteVersion`, `restoreNoteVersion`), `hooks/` (`useNoteVersionsQuery`, `useNoteVersionQuery`, `useRestoreNoteVersionMutation`), `components/HistoryDrawer.tsx` (trigger + sheet + view switching), `components/VersionList.tsx`, `components/VersionPreview.tsx`, and a small `lib/format-version-time.ts`. Types come from `@note-taking-app/shared`; restore returns `NoteDto`. Nothing is redefined. *Alternative:* put it under `features/notes/` - rejected, since the project uses one folder per capability (`sharing`, `notes-search`, `tags`).

### 2. `HistoryDrawer` is controlled by the editor through two callbacks
Props: `noteId`, `onBeforeRestore: () => Promise<void>`, `onRestored: (note: NoteDto) => void`. Like `ShareDialog`, it owns its "History" trigger button and open state so Radix returns focus to the trigger on close. The drawer knows nothing about TipTap, autosave, or title/tag state; the editor page supplies flush and re-seed behavior. *Alternative:* have the drawer import `useAutosave`/the editor - rejected; it would couple the feature folder to editor internals and make it untestable in isolation.

### 3. Query keys and gating
Versions list: `["notes", noteId, "versions"]` with `enabled: open` and `staleTime: 0`, so each open revalidates and a closed drawer makes no request. Single version: `["notes", noteId, "versions", versionId]`, enabled only while a version is selected; versions are immutable, so `staleTime: Infinity` is safe for a given id. The `["notes", ...]` prefix is deliberate: it matches `invalidateQueries(["notes"])` so the restore's list refresh needs no extra bookkeeping, but the explicit versions invalidation is still issued so the intent is visible and testable.

### 4. Drawer is a `Sheet` over the existing Radix Dialog
Add `components/ui/sheet.tsx` as a right-anchored variant of the dialog structure (same `radix-ui` import and `data-slot` conventions as `dialog.tsx`), with slide-in/out animation classes. Radix provides the focus trap, Esc, `aria-labelledby/describedby`, and focus return, which covers the accessibility requirement without custom code. *Alternative:* add a drawer library (e.g. vaul) - rejected; a new dependency for a styled dialog. *Alternative:* reuse `DialogContent` centered - rejected; a list plus preview needs height, and "drawer" is the ticket's wording.

### 5. Two views inside one sheet, driven by local state
`selectedVersionId: string | null`. `null` shows the list; set shows the preview with a Back button. Closing the sheet resets selection. No router state: the drawer is transient and deep-linking a version is not required.

### 6. Read-only preview reuses `StarterKit` and `splitNoteContent`
`VersionPreview` is mounted only after the version has loaded and is keyed by `versionId`, so `useEditor({ editable: false, extensions: [StarterKit], content })` is created with the right content and never needs `setContent`. It renders `version.title` as a heading and uses `splitNoteContent(version.content).bodyContent` as the body so the title is not shown twice. Reusing the editor's extensions guarantees the formatting matches what the author saw. `editable: false` means no `onUpdate`, so the preview can never schedule an autosave. *Alternative:* `generateHTML` + `dangerouslySetInnerHTML` - rejected (raw HTML injection); *alternative:* a plain-text preview - rejected, it loses formatting and makes the restore choice blind.

### 7. Restore sequence and the autosave race
```
click Restore
  -> onBeforeRestore()          editor: autosave.flushPending()  (rejects on failure)
       fail -> show error in drawer, stop (no POST)
  -> POST restore
       404  -> not-found handling (Decision 9)
       fail -> show error, Restore enabled again, editor untouched
       ok   -> onRestored(note):
                 autosave.cancelPendingSave()
                 seedFromNote(note)         body (emitUpdate=false), title, tagIds
                 setQueryData(["note", id], note)
                 invalidate versions list + ["notes"]
                 close drawer
```
Flush-first (rather than cancel-first) is chosen so the user's last few seconds of typing become a snapshot instead of being silently discarded; the server snapshots the then-current content when the restore arrives, so the restore remains undoable. Because the flush resolves before the POST is sent, and `cancelPendingSave()` runs immediately before re-seeding, no timer from the pre-restore session can fire a stale `PATCH`. The drawer disables Restore while the mutation is pending to prevent double-submits.

To support this, `useAutosave` gains `flushPending(): Promise<void>`, exposing the existing internal `flush()` (a no-op when nothing is dirty, serialized behind any in-flight save, rejecting on failure). `saveNow()` is not used because it forces the dirty flag and would resend already-saved content. `cancelPendingSave()` must also reset `status` so a stale "Unsaved changes" label is not shown after the re-seed. *Alternative:* cancel pending edits and POST immediately - rejected as data-losing.

### 8. Extract `seedFromNote(note)` in `NoteEditorPage`
The existing seed effect body (split content, set `titleRef`/`titleText`, `setTagIds`, `editor.commands.setContent(body, false)`) moves into a function used by both the once-per-note effect and the restore handler. `emitUpdate=false` ensures TipTap's `onUpdate` does not fire, so re-seeding cannot schedule an autosave. The no-clobber guard (`seededNoteIdRef`) is untouched for background refetches; only the explicit restore path calls `seedFromNote` again. The spec's amended "Background refetches" requirement records this as the single exception.

### 9. A 404 always defers to the editor's not-found state
Each history hook surfaces `status === 404` to the drawer via one `handleNotFound` function: close the drawer, `invalidateQueries(["note", noteId])`, and `invalidateQueries(["notes", noteId, "versions"])`. The drawer never renders its own not-found message. If the note is gone, the refetch 404s and the existing `NoteEditorPage` branch renders "Note not found"; if only the version was purged, the note refetch succeeds, the editor stays, and the list refetch drops the missing entry. Both history queries use `retry: false`: the drawer offers an explicit Retry action, and a 404 can never succeed on retry, so a gone note is not hammered. The status check is done once on the normalized error (`NormalizedApiError.status`), not duplicated per component.

### 10. Time formatting
`Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })` in a pure helper, with the formatter constructed once at module scope. Rendered inside a `<time dateTime={createdAt}>` for semantics. No date library is added.

### 11. Accessibility
The sheet has a visible title and description, a close button with an accessible name, and returns focus to the History trigger. Version rows are `<button>` elements with the title and time as their name. Loading is announced with the existing `Spinner`'s status semantics and errors with `Alert` (`role="alert"`). The "Your current version will be saved to history." hint is associated with the Restore button via `aria-describedby`.

## Risks / Trade-offs

- **[Restore overwrites content but not tags; the API restores `content` only]** → The returned `NoteDto.tags` reflects the server's actual tag state, so re-seeding `tagIds` from the response keeps the UI truthful. The spec says the tag selection "shows the returned note", not that tags are rolled back.
- **[Flush fails (offline/server error), blocking restore]** → The drawer shows an error and keeps the user's unsaved edits; they can retry. Restoring over unsaved edits without a successful flush would lose them, so blocking is the safer trade-off.
- **[Large documents make the preview heavy]** → Previews are created only for the selected version and destroyed when the user goes back; the list endpoint already omits `content`, so listing stays cheap.
- **[Drawer open while another tab deletes or restores the note]** → The next history request 404s or returns fresh data; Decision 9 covers the 404 path, and `staleTime: 0` revalidates the list on each open.
- **[Version list inflates for heavily edited notes]** → Bounded by the 30-day purge and by the fact that no-op updates create no version; pagination is a non-goal until the API supports it.
- **[`useAutosave` change touches shared editor behavior]** → The addition is an export of existing internal behavior plus a status reset in `cancelPendingSave`; existing autosave tests are extended (task 1.2) to prove the existing scenarios are unaffected.

## Migration Plan

No data or schema migration. Ship as one frontend change; roll back by reverting it. No feature flag: the History button is additive and the backend is already live.
