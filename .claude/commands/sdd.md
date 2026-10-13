---
description: Run the 7-stage spec-driven workflow (OpenSpec + test-first + independent reviews) for a change
argument-hint: <change-name-or-description>
allowed-tools: Bash(openspec:*), Bash(pnpm:*), Bash(git:*), Bash(docker compose:*), Read, Grep, Glob, Edit, Write, Agent, Skill
---

Drive the full SDD workflow for: $ARGUMENTS

If `$ARGUMENTS` is empty, run `openspec list --json` and ask which change (or what to build). Never read `.env*`. Contracts: `AGENTS.md`; stage reference: `docs/development/sdd-workflow.md`. Keep a running **gate table** (Gate | Status | Evidence) with only PASS / FAIL / BLOCKED / NOT APPLICABLE. A check you did not run, or that could not run, is BLOCKED or NOT APPLICABLE with a reason, never PASS. Do not push to `main`, force-push, or open a PR unless the user asked.

## Stage 1 - Explore and propose
If `$ARGUMENTS` names an existing change in `openspec/changes/`, use it. Otherwise invoke the `openspec-explore` skill if the request is unclear, then `openspec-propose` (or `openspec-ff-change`). Artifacts must satisfy `openspec/config.yaml` rules (ticket ID, authorization-denied and validation-failure scenarios, WHEN/THEN, tests-first tasks). Small bug fixes/typos/dependency bumps may skip OpenSpec per CLAUDE.md "Fast lane": mark spec gates NOT APPLICABLE and say why.

## Stage 2 - Spec review and approval
Run `openspec validate <name> --strict`; fix artifact issues. Self-review the artifacts for completeness, testability, and out-of-scope items (CLAUDE.md "Never"). Show the user the proposal/specs/tasks summary and STOP for explicit approval. No tests or production code before approval.

## Stage 3 - Tests first
Invoke via the Agent tool (subagent_type `test-writer`) with: change name, spec paths, scenario list. If any scenario has meaningful user-visible/cross-component behavior, also invoke `e2e-test-writer`; otherwise gate = NOT APPLICABLE. Then:
1. Review the returned tests yourself: every scenario ID mapped, authorization and validation scenarios present, full THEN asserted, no weakened assertions, no production code touched (`git status`/`git diff --stat`).
2. Red run: `pnpm test` (and `pnpm run test:e2e` after `docker compose up -d` if E2E written). Failures must be BEHAVIOR (missing behavior). ENVIRONMENT failures: fix the environment or mark BLOCKED. Tests already passing are acceptable only with documented existing behavior.

## Stage 4 - Implement
Follow the `openspec-apply-change` skill: implement tasks in order, tick `tasks.md` as done, run tests to green. Do not edit tests to make them pass unless the test is wrong, and then record why. No new `any`, `@ts-ignore`, or `eslint-disable`.

## Stage 5 - Local gates
Run each and record real exit status and counts:
`pnpm lint --max-warnings 0`, `pnpm run typecheck`, `pnpm test`, `pnpm build`, and relevant e2e (`pnpm run test:e2e`, needs `docker compose up -d` + Chromium installed; BLOCKED if unavailable, NOT APPLICABLE only if no UI/cross-component behavior). Optionally `pnpm test:coverage` (>=80% on new code). Fix failures and re-run all gates.

## Stage 6 - Independent reviews and remediation
Collect evidence first: `git diff main...HEAD`, `git status`, the change directory path, and Stage 5 results. Invoke via the Agent tool, in parallel, each with the diff range, change path, and validation evidence (they must still inspect the actual diff):
- `code-reviewer` (always)
- `spec-reviewer` (always)
- Specialists when relevant: `prisma-reviewer` (schema.prisma/migrations touched), `security-reviewer-api` (apps/api auth, input, data access), `security-reviewer-web` (apps/web), `code-quality-reviewer-api` / `code-quality-reviewer-web` (respective app), `test-coverage-reviewer` (always before archive).
Gate passes only if code-reviewer and spec-reviewer verdicts are PASS or PASS WITH NON-BLOCKING FINDINGS, no UNVERIFIED rows, and specialists report no blocking issues. On FAIL: fix the findings (smallest change), re-run Stage 5, then re-run every reviewer whose scope the changes touch (default: both mandatory reviewers). A prior PASS is invalid after any code change. Stop and ask the user after 3 failed remediation rounds. Record non-blocking findings in the report.

## Stage 7 - Final validation and archive
1. `openspec validate --strict` (all) must pass.
2. Invoke the `opsx:verify` skill for the change; address CRITICAL issues.
3. FRS/SDS sync: apply the spec-reviewer's required updates to `docs/requirements/FRS.md` and `docs/architecture/SDS.md`; if none required, state so. If docs changed, re-run lint (prettier) and the affected reviews.
4. Archive (`opsx:archive` skill) ONLY if every gate is PASS or NOT APPLICABLE-with-reason, with no BLOCKED/FAIL. Otherwise do not archive; report what is outstanding.
5. Commits follow `feat(scope): description AB#ticket` (only commit if the user asked). Open a PR only if requested, using the `create-pr` command.

## Final completion report (required format)
1. **Change**: name, ticket, outcome (COMPLETE / INCOMPLETE / BLOCKED).
2. **Gate table**: Gate | Status | Evidence (command and real result).
3. **Scenario matrix**: scenario ID | test(s) | result.
4. **Reviews**: each reviewer, verdict, rounds run, remaining non-blocking findings.
5. **Docs**: FRS/SDS updated or not required (with reason); archive status.
6. **Skipped / blocked checks** and why; honest caveats (what was agent-judged rather than machine-enforced).
7. **Next steps** for the user.
