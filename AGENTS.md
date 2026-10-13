# AGENTS.md

Human-readable contract for the subagents under `.claude/agents/`. Stage details: [docs/development/sdd-workflow.md](docs/development/sdd-workflow.md). Project rules: `CLAUDE.md`. Product/design docs: [FRS](docs/requirements/FRS.md), [SDS](docs/architecture/SDS.md).

**This file is not auto-executed.** Claude Code does not read it to run anything. The wiring is the `/sdd` slash command (`.claude/commands/sdd.md`), which invokes these agents in order. Agents can also be invoked by hand. `pnpm run validate:workflow` checks agent frontmatter and required files, not agent behavior.

## Agents

| Agent                                | Invoke when                                             | Tools                                  | Required output                                                             | Pass / fail                                                                 |
| ------------------------------------ | ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `test-writer`                        | Stage 3, after spec approval                            | Read, Grep, Glob, Edit, Write, Bash    | Scenario-to-test matrix; red-run results classified BEHAVIOR vs ENVIRONMENT | Every scenario has a test; failures are BEHAVIOR; no production code edited |
| `e2e-test-writer`                    | Stage 3, only for user-visible/cross-component behavior | Read, Grep, Glob, Edit, Write, Bash    | AC-to-E2E matrix with real results, or NOT APPLICABLE                       | Real run, or BLOCKED (Postgres via `docker compose up -d`)                  |
| `code-reviewer`                      | Stage 6 and after every remediation                     | Read, Grep, Glob, Bash (git read-only) | Verdict + findings (severity, file:line, evidence, impact, fix)             | FAIL on any BLOCKER/MAJOR                                                   |
| `spec-reviewer`                      | Stage 6 and after every remediation                     | Read, Grep, Glob, Bash (read-only)     | AC matrix, drift, FRS/SDS needs, verdict                                    | Any FAIL or UNVERIFIED row = FAIL                                           |
| `prisma-reviewer`                    | Stage 6 when schema/migrations changed                  | Read, Grep, Glob                       | Findings                                                                    | No blocking findings                                                        |
| `security-reviewer-api` / `-web`     | Stage 6 when the respective app changed                 | Read, Grep, Glob                       | Findings                                                                    | No blocking findings                                                        |
| `code-quality-reviewer-api` / `-web` | Stage 6 when the respective app changed                 | Read, Grep, Glob                       | Findings                                                                    | No blocking findings                                                        |
| `test-coverage-reviewer`             | Stage 6, before archive                                 | Read, Grep, Glob                       | covered / untested / partial per scenario                                   | No untested scenarios                                                       |

Verdicts for `code-reviewer` and `spec-reviewer`: PASS / PASS WITH NON-BLOCKING FINDINGS / FAIL.

## Execution order and handoff

1. Spec approved (no agents write tests or code before this).
2. `test-writer` (+ `e2e-test-writer`) -> orchestrator reviews tests and confirms red.
3. Orchestrator implements (`openspec-apply-change`) -> local gates.
4. `code-reviewer` and `spec-reviewer` (independent, parallel) + relevant specialists. They receive the diff range, change path, and validation evidence, and must inspect the actual diff.
5. Any code change after a review invalidates that review; re-run it.
6. Final validation, FRS/SDS sync, archive.

## What enforces what

| Mechanism                                                       | Enforced by code/CI                     | Orchestrated by `/sdd` | Agent compliance                                                 | Manual          |
| --------------------------------------------------------------- | --------------------------------------- | ---------------------- | ---------------------------------------------------------------- | --------------- |
| lint, typecheck, unit/API tests, build                          | CI / pnpm scripts                       | run in Stage 5         |                                                                  |                 |
| `openspec validate --strict`                                    | CI/hooks if configured                  | run in Stage 7         |                                                                  |                 |
| Agent frontmatter and file presence                             | `validate:workflow`                     |                        |                                                                  |                 |
| Stage order, approval stop, gate table, re-review after changes |                                         | yes                    |                                                                  |                 |
| Test-first, tests-only edits, read-only reviewers               | tool allowlists restrict reviewers only | prompts                | `test-writer` / `e2e-test-writer` honoring "no production edits" | review the diff |
| Review quality, spec-to-code judgement                          |                                         |                        | reviewer agents                                                  | human sign-off  |
| Starting `/sdd`, approving specs, commits, PRs, pushes          |                                         |                        |                                                                  | yes             |

Skipping `/sdd` skips all orchestration; only code/CI gates remain.
