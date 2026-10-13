#!/usr/bin/env bash
# PreToolUse(Bash): exit 2 + stderr message blocks the call (Claude Code hooks docs).
input=$(cat)
cmd=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).tool_input?.command??""))}catch{}})')
[[ -z "$cmd" ]] && exit 0
block() { echo "Blocked by .claude/hooks/block-dangerous.sh: $1" >&2; exit 2; }
shopt -s nocasematch

re_force='git[[:space:]]+push([^;&|]*)[[:space:]](--force|-f|--force-with-lease)([[:space:]]|$)'
re_main='git[[:space:]]+push([^;&|]*)[[:space:]](HEAD:)?(refs/heads/)?(main|master)([[:space:]]|$)'
re_rm='(^|[;&|[:space:]])rm[[:space:]]+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r[[:space:]]+-f|-f[[:space:]]+-r|--recursive)'
re_prisma='prisma[[:space:]]+(migrate[[:space:]]+reset|db[[:space:]]+push)'
re_env='(cat|less|more|head|tail|type|cp|source|grep|rg|sed|awk|bat)[[:space:]][^;&|]*\.env([[:space:].]|$)'
re_print='(printenv|echo[[:space:]]+[^;&|]*DATABASE_URL)'

[[ "$cmd" =~ $re_force ]] && block "force push is not allowed"
[[ "$cmd" =~ $re_main ]] && block "never push directly to main"
[[ "$cmd" =~ $re_rm ]] && block "rm -rf is not allowed"
[[ "$cmd" =~ $re_prisma ]] && block "prisma migrate reset / db push are destructive"
[[ "$cmd" =~ $re_env ]] && block "reading .env files is not allowed"
[[ "$cmd" =~ $re_print ]] && block "do not print env/secrets"
exit 0
