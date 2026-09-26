# review-subagents Specification

## Purpose

Defines six read-only reviewer subagents that check security, production-readiness, and coding-standard conformance separately for backend and frontend code, plus Prisma migrations and test coverage.

## Requirements

### Requirement: Six reviewer subagents exist with distinct scopes

`.claude/agents/` SHALL contain six agent definitions: `security-reviewer-api`, `security-reviewer-web`, `code-quality-reviewer-api`, `code-quality-reviewer-web`, `prisma-reviewer`, and `test-coverage-reviewer`. Each SHALL declare a name, a triggering description, and an explicit tool allowlist.

#### Scenario: All six agents are defined

- **WHEN** a developer lists the files in `.claude/agents/`
- **THEN** all six agent definitions are present, each with a name, a triggering description, and a declared tool allowlist

### Requirement: Reviewer agents are read-only

Every reviewer agent's declared toolset SHALL exclude file-editing tools, so it can read code and report findings but cannot modify files.

#### Scenario: Agent cannot edit files

- **WHEN** any of the six reviewer agents is invoked
- **THEN** its declared tool allowlist contains no edit or write capability

### Requirement: Security reviewers check the project's prohibited-pattern list

`security-reviewer-api` and `security-reviewer-web` SHALL check changed code against CLAUDE.md's "Never" list (e.g. logging passwords/OTPs/tokens, introducing OAuth/social login, physically deleting note rows) and report violations with a reference to the violated rule.

#### Scenario: Security reviewer flags a violation

- **WHEN** `security-reviewer-api` or `security-reviewer-web` is run against a diff that logs a password, OTP, or auth token, or introduces OAuth/social login
- **THEN** the agent reports the violation and names the specific CLAUDE.md rule it violates

### Requirement: prisma-reviewer checks migration and query safety

`prisma-reviewer` SHALL check Prisma schema and query changes for missing `@@index` on frequently filtered columns, use of `$queryRawUnsafe`, hand-edited applied migrations, and violations of the soft-delete convention.

#### Scenario: prisma-reviewer flags an unsafe raw query

- **WHEN** a diff introduces a `$queryRawUnsafe` call or a physical delete of a note row
- **THEN** `prisma-reviewer` reports the violation

### Requirement: test-coverage-reviewer maps spec scenarios to tests

`test-coverage-reviewer` SHALL check that every spec scenario in an OpenSpec change has at least one corresponding automated test (Supertest and/or Playwright) and report scenarios with no matching test.

#### Scenario: test-coverage-reviewer flags an untested scenario

- **WHEN** a change's spec delta contains a scenario with no corresponding test in the diff
- **THEN** `test-coverage-reviewer` reports that scenario as untested
