import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routes } from "./router.js";
import { RootLayout } from "./RootLayout.js";
import { RouteErrorFallback } from "./RouteErrorFallback.js";
import { createQueryClient } from "../lib/query-client.js";

describe("root layout", () => {
  it("renders the layout at /", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});

describe("not-found page", () => {
  it("renders instead of a blank screen for an undefined path", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/this-does-not-exist"] });
    render(<RouterProvider router={router} />);

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
