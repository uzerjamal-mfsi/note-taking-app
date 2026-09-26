# dev-environment-docker Specification

## Purpose

Provides a reproducible local PostgreSQL instance and containerized runtime for apps/api and apps/web so any developer can bring up the full stack without installing Postgres or Node locally.

## Requirements

### Requirement: Local Postgres via Docker Compose

The repository SHALL include a `docker-compose.yml` defining a `postgres:16` service whose connection details match the `DATABASE_URL` consumed by `packages/db`.

#### Scenario: docker compose brings up a working database

- **WHEN** a developer runs `docker compose up -d postgres`
- **THEN** a PostgreSQL 16 instance becomes reachable on the configured host and port, and `pnpm run db:migrate` can connect to it

#### Scenario: Data persists across container restarts

- **WHEN** the postgres container is stopped and restarted without removing its volume
- **THEN** data written before the restart is still present afterward

### Requirement: apps/api has a container image

`apps/api` SHALL include a `Dockerfile` that builds a runnable image for the Express API.

#### Scenario: API image builds and starts

- **WHEN** a developer runs `docker build -f apps/api/Dockerfile .` followed by `docker run` on the resulting image
- **THEN** the image builds successfully and the container listens on the API's configured port

### Requirement: apps/web has a container image

`apps/web` SHALL include a `Dockerfile` that builds a runnable image serving the built React app.

#### Scenario: Web image builds and starts

- **WHEN** a developer runs `docker build -f apps/web/Dockerfile .` followed by `docker run` on the resulting image
- **THEN** the image builds successfully and the container serves the web app on its configured port
