# Spec-Driven Development workflow

Run with `/sdd <change-name-or-description>` (`.claude/commands/sdd.md`). Agent responsibilities live in [AGENTS.md](../../AGENTS.md) and are not repeated here. `pnpm run validate:workflow` (`validate:workflow`) checks agent frontmatter and required files.

## Stages

| #   | Stage                  | Agent / skill                                          | Inputs                          | Outputs                       | Validation                                                                                  | Pass / fail                                                | Recovery                                                            |
| --- | ---------------------- | ------------------------------------------------------ | ------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Explore and propose    | `openspec-explore`, `openspec-propose`                 | request, `openspec/config.yaml` | `openspec/changes/<name>/`    | -                                                                                           | artifacts complete                                         | refine with `opsx:update`                                           |
| 2   | Spec review + approval | orchestrator, user                                     | change artifacts                | approval                      | `openspec validate <name> --strict`                                                         | valid and user-approved                                    | revise artifacts, re-approve                                        |
| 3   | Tests first            | `test-writer`, `e2e-test-writer` (if applicable)       | approved scenarios              | test files, scenario matrix   | `pnpm test`, `pnpm run test:e2e`                                                            | failures are BEHAVIOR (red) or already-passing documented  | fix tests; fix environment or mark BLOCKED                          |
| 4   | Implement              | `openspec-apply-change`                                | tasks.md, tests                 | production code, ticked tasks | tests green                                                                                 | all tasks done, tests green                                | fix code, not tests                                                 |
| 5   | Local gates            | orchestrator                                           | working tree                    | gate results                  | `pnpm lint --max-warnings 0`, `pnpm run typecheck`, `pnpm test`, `pnpm build`, relevant e2e | all exit 0                                                 | fix, re-run all                                                     |
| 6   | Independent review     | `code-reviewer`, `spec-reviewer`, relevant specialists | diff, change path, evidence     | verdicts, AC matrix           | reviewers inspect the diff                                                                  | PASS or PASS WITH NON-BLOCKING FINDINGS; UNVERIFIED = FAIL | remediate, re-run Stage 5 and affected reviews (prior PASS invalid) |
| 7   | Final validation       | `opsx:verify`, `opsx:archive`                          | all of the above                | docs synced, archived change  | `openspec validate --strict`, verify skill                                                  | every gate PASS or justified NOT APPLICABLE                | do not archive; report outstanding items                            |

Gate statuses are PASS / FAIL / BLOCKED / NOT APPLICABLE; a skipped check is never PASS. A PR is opened only on request (`create-pr`).

## Distinctions

- **FRS vs SDS**: [FRS](../requirements/FRS.md) says what the system must do; [SDS](../architecture/SDS.md) says how it is designed. `spec-reviewer` flags which needs updating.
- **Change artifacts vs permanent specs**: `openspec/changes/<name>/` is the proposal in flight; `openspec/specs/` is the current truth after archive/sync. FRS/SDS are narrative docs, updated by hand at Stage 7.
- **Test authoring vs execution**: writer agents author and run tests to confirm red; the orchestrator re-runs everything in Stages 5 and 7. An agent's claim of "tests pass" is evidence only with the real command output.
- **Code review vs spec compliance**: `code-reviewer` asks "is this code correct and conventional?"; `spec-reviewer` asks "does it do what the spec says, and no more?". Both must pass, independently.
- **Automated vs agent-dependent**: lint, typecheck, tests, build, `openspec validate`, and `validate:workflow` are deterministic; stage order, test-first discipline, and review judgement depend on `/sdd` and agent compliance (see the enforcement table in AGENTS.md).
