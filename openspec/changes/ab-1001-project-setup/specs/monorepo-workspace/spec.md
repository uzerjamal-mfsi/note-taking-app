# Spec Delta

## Purpose

Defines the pnpm workspace layout and Prisma initialization that every application, package, and future feature in this repository builds on top of.

## ADDED Requirements

### Requirement: pnpm workspace resolves all packages

The repository SHALL be a pnpm workspace containing `apps/api`, `apps/web`, `packages/shared`, `packages/config`, and `packages/db` as workspace members.

#### Scenario: Fresh install resolves workspace packages

- **WHEN** a developer runs `pnpm install --frozen-lockfile` from the repo root on a clean checkout
- **THEN** pnpm installs dependencies for every workspace package without errors

### Requirement: packages/shared is the single source of DTOs and Zod schemas

All request/response DTOs and Zod validation schemas SHALL be defined once in `packages/shared` and imported by both `apps/api` and `apps/web`. No package SHALL redefine an equivalent type or schema locally.

#### Scenario: Apps import shared types without duplication

- **WHEN** `apps/api` or `apps/web` needs a request/response type or Zod schema
- **THEN** it imports the type or schema from `packages/shared` rather than declaring its own

### Requirement: packages/config centralizes shared tooling configuration

Shared TypeScript, ESLint, and Prettier configuration SHALL live in `packages/config` and be extended by `apps/api`, `apps/web`, `packages/shared`, and `packages/db` rather than duplicated per package.

#### Scenario: A workspace package extends the shared config

- **WHEN** any workspace package defines its `tsconfig.json` or ESLint config
- **THEN** it extends the base configuration exported from `packages/config` instead of redeclaring equivalent rules

### Requirement: packages/db owns the Prisma project

`packages/db` SHALL own the Prisma schema, configured for the `postgresql` provider. Once the schema has at least one model, `packages/db` SHALL also export the generated Prisma client for `apps/api` to import; `prisma generate` refuses to run against a zero-model schema, so no client is generated or exported in this change.

#### Scenario: Prisma CLI recognizes the schema

- **WHEN** a developer runs the workspace's Prisma validate command against `packages/db`
- **THEN** Prisma successfully loads `packages/db/prisma/schema.prisma` with the `postgresql` provider configured and no models defined yet

### Requirement: Workspace-wide checkpoints pass on an empty scaffold

With no application code yet written, the workspace's build, lint, and test commands SHALL each complete successfully across all packages.

#### Scenario: Build passes with zero application code

- **WHEN** a developer runs `pnpm build` from the repo root immediately after this change is applied
- **THEN** the command completes with 0 errors and 0 warnings across every workspace package
