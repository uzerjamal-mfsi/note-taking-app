import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const singleNoteResponse = {
  id: "note-1",
  title: "Grocery list",
  content: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Grocery list" }] }],
  },
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-27T00:00:00.000Z",
  tags: [],
};

function stubApiFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/tags")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (/\/notes\/[^/?]+$/.test(url)) {
        return { ok: true, status: 200, json: async () => singleNoteResponse };
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

describe("note editor route", () => {
  it("renders the note editor at /notes/:noteId for an authenticated visitor", async () => {
    useSessionStore.setState({
      status: "authenticated",
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "token",
    });
    stubApiFetch();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));
  });

  it("redirects an unauthenticated visitor away from /notes/:noteId to /login without requesting the note", () => {
    stubApiFetch();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/notes/note-1"),
      expect.anything(),
    );
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

describe("public shared note route", () => {
  const sharedResponse = {
    title: "Shared title",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Shared title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Shared body" }] },
      ],
    },
  };

  function renderShared() {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/shared/")) {
        return { ok: true, status: 200, json: async () => sharedResponse };
      }
      return { ok: true, status: 200, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/shared/tok-1"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    return fetchMock;
  }

  function sharedRequestHeaders(fetchMock: ReturnType<typeof vi.fn>) {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/shared/tok-1")) as
      | [string, RequestInit]
      | undefined;
    return call?.[1].headers as Record<string, string> | undefined;
  }

  it("renders for a visitor with no session, without redirecting", async () => {
    const fetchMock = renderShared();

    expect(await screen.findByRole("heading", { name: "Shared title" })).toBeInTheDocument();
    expect(screen.getByText("Shared body")).toBeInTheDocument();
    expect(sharedRequestHeaders(fetchMock)?.Authorization).toBeUndefined();
  });

  it("renders for an authenticated user, without redirecting and without sending their token", async () => {
    useSessionStore.setState({
      status: "authenticated",
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "secret-token",
    });
    const fetchMock = renderShared();

    expect(await screen.findByRole("heading", { name: "Shared title" })).toBeInTheDocument();
    expect(sharedRequestHeaders(fetchMock)?.Authorization).toBeUndefined();
  });
});

describe("share modal with an unrecoverable session", () => {
  it("returns the user to /login when the share request 401s and the session cannot be refreshed", async () => {
    useSessionStore.setState({
      status: "authenticated",
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "expired-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/auth/refresh")) {
          return { ok: false, status: 401, json: async () => ({ code: "X", message: "no" }) };
        }
        if (url.endsWith("/notes/note-1/share")) {
          return { ok: false, status: 401, json: async () => ({ code: "X", message: "expired" }) };
        }
        if (url.includes("/tags")) {
          return { ok: true, status: 200, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => singleNoteResponse };
      }),
    );
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <AppRoutes />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Share" }, { timeout: 8000 }));

    expect(
      await screen.findByRole("link", { name: "Create one" }, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(useSessionStore.getState().status).not.toBe("authenticated");
    expect(screen.queryByLabelText("Public link")).not.toBeInTheDocument();
  }, 20000);
});
