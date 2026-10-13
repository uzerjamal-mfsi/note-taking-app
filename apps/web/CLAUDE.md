# apps/web — scoped rules (root CLAUDE.md still applies)

## Structure

- `src/features/<feature>/{components,hooks,api}` (+ optional `lib`). The `local/feature-structure` ESLint rule enforces this; check `packages/config/src/structure-rule.js` before adding other subfolders.
- Shared UI in `src/components/ui` (vendored shadcn, do not hand-edit), app-wide state in `src/store` (Zustand), providers in `src/providers`, routes in `src/routes`.

## Data and state

- Server state only through TanStack Query hooks in `hooks/` (`useXxxQuery` / `useXxxMutation`) that call functions in `api/`. Components never call `fetch`/axios.
- Types and Zod schemas come from `@note-taking-app/shared`; no local copies, no `any`.
- Zustand (`session-store`, `ui-store`) is for client/UI state only; never mirror query data into it.
- Invalidate or update query caches in mutation `onSuccess`.

## Editor

- TipTap with debounced autosave via `features/notes/hooks/use-autosave.ts`; reuse it, do not add a second save path.

## UI and accessibility

- Function components with explicit `Props` interfaces. Prefer shadcn primitives (Radix supplies keyboard/ARIA behavior).
- Every interactive element: keyboard reachable, visible focus, accessible name (`aria-label` on icon buttons); dialogs trap focus; async status via `role="status"` / `aria-live`.

## Tests

- Vitest + React Testing Library (setup in `src/test/setup.ts`); query by role/label, use `userEvent`, wrap in a fresh QueryClient. Mock the feature `api/` module, not `fetch`.
- Playwright specs live in `e2e/` (needs Postgres; see root Commands). Prefer role/label locators and `e2e/fixtures.ts`.
- Run: `pnpm --filter @note-taking-app/web test`.
