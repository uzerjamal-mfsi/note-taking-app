import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useRoutes,
  type RouteObject,
} from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routes } from "./router.js";
import { RootLayout } from "./RootLayout.js";
import { RouteErrorFallback } from "./RouteErrorFallback.js";
import { createQueryClient } from "../lib/query-client.js";
import { useSessionStore } from "../store/session-store.js";

afterEach(() => {
  useSessionStore.setState({ status: "idle", user: null, accessToken: null });
});

// Rendered via the declarative `useRoutes` API (not `createMemoryRouter`/`RouterProvider`):
// the data-router's navigation/fetcher machinery constructs a `Request` with an `AbortSignal`
// that jsdom's `AbortController` polyfill produces but undici's `instanceof` check rejects,
// an environment-only incompatibility unrelated to this app's code. `useRoutes` renders the
// exact same route tree without exercising that code path.
function AppRoutes() {
  return useRoutes(routes);
}

describe("root layout", () => {
  it("renders the layout at / for an authenticated visitor", () => {
    useSessionStore.setState({
      status: "authenticated",
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "token",
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});

describe("not-found page", () => {
  it("renders instead of a blank screen for an undefined path", () => {
    render(
      <MemoryRouter initialEntries={["/this-does-not-exist"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });
});

function Boom(): never {
  throw new Error("boom");
}

describe("route-level error boundary", () => {
  it("catches a render error within the routed tree and shows its fallback", () => {
    const testRoutes: RouteObject[] = [
      {
        path: "/",
        Component: RootLayout,
        ErrorBoundary: RouteErrorFallback,
        children: [{ index: true, Component: Boom }],
      },
    ];
    const router = createMemoryRouter(testRoutes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
