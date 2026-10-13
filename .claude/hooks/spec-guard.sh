#!/usr/bin/env bash
# PreToolUse(Edit|Write): non-blocking reminder (exit 0 + additionalContext) when production code in
# apps/*/src is edited while openspec/changes/ has no active (non-archive) change. Fast-lane fixes
# are legitimate, so this never blocks.
file=$(cat | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).tool_input?.file_path??""))}catch{}})')
f=${file//\\//}
[[ "$f" =~ /apps/[^/]+/src/ ]] || exit 0
[[ "$f" =~ \.(test|spec)\.tsx?$ || "$f" =~ /test(-helpers)?/ ]] && exit 0
root="${CLAUDE_PROJECT_DIR:-.}/openspec/changes"
active=$(find "$root" -mindepth 1 -maxdepth 1 -type d ! -name archive 2>/dev/null | head -1)
[[ -n "$active" ]] && exit 0
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"No active change in openspec/changes/. Production code needs an approved OpenSpec change unless this is a fast-lane fix (bug/typo/dep bump)."}}'
exit 0
