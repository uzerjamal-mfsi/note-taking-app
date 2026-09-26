# api-docs Specification

## Purpose

Provides auto-generated, browsable API documentation for `apps/api`, generated from the same Zod schemas used for request/response validation so the documentation cannot drift from the actual contract.

## Requirements

### Requirement: OpenAPI spec is generated from the shared Zod schemas

The API SHALL generate its OpenAPI specification from the request/response Zod schemas defined in `packages/shared`, rather than from hand-written, separately maintained documentation.

#### Scenario: Endpoint schema changes are reflected in the spec

- **WHEN** a request/response Zod schema in `packages/shared` changes
- **THEN** the generated OpenAPI spec reflects the updated schema without any hand-edited duplicate documentation being updated separately

### Requirement: Swagger UI is served for interactive exploration

The API SHALL serve a Swagger UI at a configured docs path, rendering the generated OpenAPI spec.

#### Scenario: Docs endpoint serves the UI

- **WHEN** a developer requests the configured docs path (e.g. `/api-docs`)
- **THEN** Swagger UI renders, listing every currently defined endpoint (e.g. the health check) with its request/response schema

### Requirement: Docs endpoint is not exposed in production

The API SHALL NOT register the docs endpoint when running in a production environment.

#### Scenario: Docs disabled in production

- **WHEN** the API starts with its environment configured as production
- **THEN** a request to the docs path receives HTTP 404 rather than Swagger UI
