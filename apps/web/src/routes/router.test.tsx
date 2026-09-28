import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  vi.unstubAllGlobals();
});

// Rendered via the declarative `useRoutes` API (not `createMemoryRouter`/`RouterProvider`):
// the data-router's navigation/fetcher machinery constructs a `Request` with an `AbortSignal`
// that jsdom's `AbortController` polyfill produces but undici's `instanceof` check rejects,
// an environment-only incompatibility unrelated to this app's code. `useRoutes` renders the
// exact same route tree without exercising that code path.
function AppRoutes() {
  return useRoutes(routes);
}

const notesPageResponse = {
  data: [],
  meta: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

function stubApiFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/tags")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => notesPageResponse };
    }),
  );
}

describe("root layout", () => {
  it("renders the layout at / for an authenticated visitor", () => {
    useSessionStore.setState({
      status: "authenticated",
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "token",
    });
    stubApiFetch();
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

  it("renders the notes list (not the old placeholder) for an authenticated visitor", async () => {
    useSessionStore.setState({
      status: "authenticated",
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "token",
    });
    stubApiFetch();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
    expect(screen.queryByText(/API status/i)).not.toBeInTheDocument();
  });

  it("reads page/sortBy/sortDir/tags from the URL and requests GET /notes with those params", async () => {
    useSessionStore.setState({
      status: "authenticated",
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "token",
    });
    stubApiFetch();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/?page=2&sortBy=createdAt&sortDir=asc&tags=work"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/notes\?.*page=2.*sortBy=createdAt.*sortDir=asc.*tags=work/),
        expect.anything(),
      ),
    );
  });

  it("redirects an unauthenticated visitor away from / to /login without requesting notes", () => {
    stubApiFetch();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/notes"), expect.anything());
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
