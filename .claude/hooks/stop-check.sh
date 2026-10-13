#!/usr/bin/env bash
# Stop: cheap deterministic guard (replaces the old full typecheck+test run, which is far too slow
# per stop; husky pre-commit and CI already run build/lint/test). Only runs prettier --check on
# changed files; exit 2 makes Claude fix formatting before finishing.
input=$(cat)
printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
files=$(git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|mjs|json|css)$')
[[ -z "$files" ]] && exit 0
if ! out=$(echo "$files" | xargs pnpm exec prettier --check 2>&1); then
  echo "Prettier check failed on changed files; run: pnpm exec prettier --write <files>" >&2
  echo "$out" | tail -15 >&2
  exit 2
fi
exit 0
