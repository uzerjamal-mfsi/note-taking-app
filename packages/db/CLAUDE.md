# packages/db — scoped rules (root CLAUDE.md still applies)

- Schema: `prisma/schema.prisma`. Every change goes through `pnpm run db:migrate` (migrate dev); commit the generated migration folder.
- Never edit, rename, or delete an applied migration; fix forward with a new one. Never run `migrate reset` or `db push` (denied in settings and blocked by hook).
- Add `@@index` for new filter/sort columns; FTS (GIN on `tsvector`) indexes go in hand-reviewed migration SQL.
- Notes are soft-deleted: no cascades that physically remove note rows inside the 30-day window.
- `generated/` is build output; regenerate with `pnpm --filter @note-taking-app/db exec prisma generate`.
- CI runs `prisma migrate deploy`; every migration must apply cleanly to an empty Postgres 16.
- Never read `.env*` or print `DATABASE_URL`.
