# Spec Delta

## Purpose

Runs the same build, lint, and test checkpoints as an automated gate on every pull request, so a failing checkpoint cannot be merged even if a contributor bypasses local hooks.

## ADDED Requirements

### Requirement: CI runs on every pull request

A GitHub Actions workflow SHALL run on every pull request targeting the default branch, executing install, build, lint, and test in that order.

#### Scenario: PR triggers the workflow

- **WHEN** a pull request is opened or updated against the repository
- **THEN** the workflow runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint --max-warnings 0`, and `pnpm test` in order

### Requirement: CI fails the check on any checkpoint failure

The workflow run SHALL report a failed status on the pull request if any checkpoint step fails, and SHALL NOT report success.

#### Scenario: Failing lint fails the check

- **WHEN** the lint step fails during a workflow run
- **THEN** the workflow run reports a failed status on the pull request and the remaining steps that depend on it do not run
