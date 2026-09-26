# web-app-shell Specification

## Purpose

Provides the baseline frontend application shell — folder structure, routing, error handling, and global providers — that every feature is built inside, before any feature-specific screen exists.

## Requirements

### Requirement: Feature code follows the feature-folder structure

Frontend feature code SHALL live under `src/features/<feature>/{components,hooks,api}`, matching CLAUDE.md's frontend conventions.

#### Scenario: A new feature follows the structure

- **WHEN** a feature folder is created under `src/features`
- **THEN** it contains `components/`, `hooks/`, and `api/` subdirectories, and no feature code lives outside `src/features`

### Requirement: The app has client-side routing with a 404 route

The application SHALL use a router with a root layout, and SHALL render a not-found page for any path with no matching route.

#### Scenario: An unknown path renders the 404 page

- **WHEN** the user navigates to a path with no matching route
- **THEN** the not-found page is rendered instead of a blank screen or an unhandled error

### Requirement: A route-level error boundary catches rendering errors

The application SHALL wrap its routed content in an error boundary that renders a fallback UI instead of a blank screen when a rendering error is thrown.

#### Scenario: A thrown rendering error shows a fallback UI

- **WHEN** a component within the routed tree throws during render
- **THEN** the error boundary displays a fallback UI instead of an unhandled crash

### Requirement: A top-level error boundary catches errors outside the router

The application SHALL wrap its providers and router in a top-level error boundary, so an error thrown outside any single route's tree (e.g. during provider initialization) still renders a fallback UI instead of a blank screen.

#### Scenario: A provider-level error is caught

- **WHEN** an error is thrown outside the routed tree, such as in a top-level provider
- **THEN** the top-level error boundary renders its fallback UI instead of a blank screen

### Requirement: Loading state is visible while route data loads

The application SHALL render a visible loading indicator in place of not-yet-available content while a routed screen's data is loading, rather than a blank screen.

#### Scenario: Loading indicator shown during initial fetch

- **WHEN** a routed screen's TanStack Query is in its initial loading state
- **THEN** a loading indicator is rendered in place of the not-yet-available content

### Requirement: Global providers wrap the application

The application SHALL be wrapped with a TanStack Query client provider and expose a Zustand store shell for client/UI state, per CLAUDE.md's state-management convention.

#### Scenario: Server state uses TanStack Query

- **WHEN** a feature needs server state
- **THEN** it is available to consume via a `useXxxQuery`/`useXxxMutation` hook backed by the app's shared `QueryClient`, not a direct `fetch`/`axios` call in a component

### Requirement: The QueryClient has explicit, documented defaults

The shared `QueryClient` SHALL be configured with explicit default options (retry policy, `staleTime`, `refetchOnWindowFocus` behavior) rather than relying on TanStack Query's library defaults.

#### Scenario: A query with no override inherits the app defaults

- **WHEN** a feature's query hook does not specify its own `retry`/`staleTime`/`refetchOnWindowFocus` options
- **THEN** it inherits the app's configured `QueryClient` defaults

### Requirement: All outbound requests go through one API client

The application SHALL centralize outbound HTTP requests in a single API client module (base URL, headers, error normalization), and feature `api/` hooks SHALL call it rather than issuing requests directly.

#### Scenario: A feature hook uses the shared client

- **WHEN** a feature's `useXxxQuery`/`useXxxMutation` hook needs to call the API
- **THEN** it calls the shared API client rather than instantiating its own `fetch`/`axios` call

#### Scenario: API error responses are normalized

- **WHEN** the API client receives an error response matching the API's shared error-response shape
- **THEN** it normalizes the response into a consistent error object usable by TanStack Query's error state, rather than surfacing a raw HTTP response object

### Requirement: The application meets a baseline of accessibility

The application SHALL lint for accessibility issues as part of `pnpm lint`, and the root layout SHALL include baseline landmarks and a skip-to-content link, per CLAUDE.md's accessibility convention.

#### Scenario: Accessibility lint rule catches a violation

- **WHEN** a component is missing a required ARIA attribute or has an inaccessible interactive element
- **THEN** `pnpm lint` fails on the accessibility rule violation

#### Scenario: Skip-to-content link is present and functional

- **WHEN** a keyboard user tabs from the top of the page
- **THEN** a skip-to-content link is the first focusable element and moves focus to the main content when activated

### Requirement: The UI component baseline is available

`shadcn/ui` SHALL be initialized with its baseline components available for feature code to compose, rather than each feature installing its own UI primitives.

#### Scenario: A feature reuses a baseline UI component

- **WHEN** a feature needs a common UI primitive (e.g. button, input, dialog)
- **THEN** it imports it from the shared `shadcn/ui` component baseline instead of introducing a new one
