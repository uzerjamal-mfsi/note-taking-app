#!/usr/bin/env bash
file=$(jq -r '.tool_input.file_path // empty')
[[ -z "$file" ]] && exit 0
if [[ "$file" =~ \.(ts|tsx|js|jsx|json|md|css)$ ]]; then
  npx prettier --write "$file" >/dev/null 2>&1
  [[ "$file" =~ \.(ts|tsx)$ ]] && npx eslint --fix "$file" >/dev/null 2>&1
fi
exit 0