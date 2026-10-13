# 0005. OpenSpec spec-driven development

Status: Accepted.

## Context

Features should be specified, reviewed and tested before implementation, with traceability from requirement to test.

## Decision

- Features, breaking changes and architecture changes go through OpenSpec (`/opsx:*` commands and `openspec-*` skills under `.claude/`). No production code without an approved change in `openspec/changes/`; small fixes may use the fast lane (`CLAUDE.md`).
- `openspec/config.yaml` sets artifact rules: ticket link, impact and rollback, WHEN/THEN scenarios, mandatory authorization-denied and validation-failure scenarios, schemas in `packages/shared` first, tests before implementation, API and web tasks separated.
- Completed changes are archived under `openspec/changes/archive/` (16 so far) and their specs live in `openspec/specs/` (21 capabilities).
- Definition of Done requires every scenario to have a test and `openspec validate --strict` to pass.
- Six read-only reviewer agents check security, quality, Prisma safety and scenario coverage (`.claude/agents`, `openspec/specs/review-subagents`).

## Consequences

- Specs are the reference for behaviour and give reviewers a checklist.
- Compliance is by convention: neither CI nor Husky runs `openspec validate`, and coverage thresholds are not configured (SDS section 11).
- Narrative docs (SDS) can drift from specs and code; they need manual sync.
