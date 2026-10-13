# 0006. Adopt OpenSpec-orchestrated SDD with independent reviewer subagents

Status: Accepted.

## Context

ADR-0005 defines the spec artifacts but not how stages are sequenced or who verifies the result. A single agent that writes tests, implements and then judges its own work gives weak evidence. Reviewers also need to be independent of the author and report against the spec, not the author's claims.

## Decision

Adopt a 7-stage workflow driven by the `/sdd` command (`.claude/commands/sdd.md`), documented in `docs/development/sdd-workflow.md`:

1. Explore and propose (OpenSpec skills), 2. spec review and explicit user approval, 3. tests first, 4. implement, 5. local gates, 6. independent review, 7. final validation, docs sync and archive.

Roles are separate agents in `.claude/agents/`:

- `test-writer` and `e2e-test-writer` author tests from approved scenarios, before implementation; red must be a behaviour failure.
- `code-reviewer` (is the code correct and conventional) and `spec-reviewer` (does it do what the spec says, and no more; flags FRS/SDS updates) review the diff independently; both must pass.
- Existing specialists (`security-reviewer-*`, `code-quality-reviewer-*`, `prisma-reviewer`, `test-coverage-reviewer`) are invoked when relevant.

The orchestrator keeps a gate table with PASS / FAIL / BLOCKED / NOT APPLICABLE; a check not run is never PASS, UNVERIFIED review rows count as FAIL, and any code change after a review invalidates that review.

## Consequences

- Better evidence: real command output per gate, independent verdicts, scenario-to-test matrix.
- Enforcement is honest, not absolute. Agents and the `/sdd` command are instruction-driven: stage order, test-first discipline and review judgement depend on model compliance. Only lint, typecheck, tests, build, `openspec validate` and the workflow validator script (`pnpm run validate:workflow`) are deterministic, and CI/Husky do not run all of them (SDS section 9).
- Higher cost per change (several agent runs, up to 3 remediation rounds before escalating to the user).
- Reviewer agents are read-only by design; fixes always return to the orchestrator.
