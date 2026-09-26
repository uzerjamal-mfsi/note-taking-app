# commit-quality-gates Specification

## Purpose

Enforces conventional commit formatting with a ticket reference, and blocks commits that would introduce a failing build, lint, or test checkpoint into history.

## Requirements

### Requirement: Commit message format is enforced

Every commit message SHALL match conventional commit format (`type(scope): description`) and include an `AB-<number>` ticket reference. Commits that do not match SHALL be rejected before being created.

#### Scenario: Commit rejected for non-conventional message

- **WHEN** a developer attempts to commit with a message that does not match `type(scope): description AB-<number>`
- **THEN** commitlint rejects the commit and no commit is created

#### Scenario: Commit accepted for a valid message

- **WHEN** a developer commits with a message such as `feat(api): add note repository AB-1002`
- **THEN** commitlint accepts the message and the commit proceeds to the remaining pre-commit checks

### Requirement: Pre-commit hook blocks failing checkpoints

The Husky pre-commit hook SHALL run the build, lint, and test checkpoints and SHALL abort the commit if any of them fails.

#### Scenario: Commit blocked on lint or test failure

- **WHEN** a developer attempts to commit while `pnpm lint --max-warnings 0` or `pnpm test` would fail
- **THEN** the pre-commit hook aborts before the commit is created and reports which checkpoint failed
