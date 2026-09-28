import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { NotesListPage } from "./NotesListPage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const tags = [
  {
    id: "tag-1",
    name: "work",
    color: "#FF0000",
    createdAt: "2026-01-01T00:00:00.000Z",
    noteCount: 2,
  },
];

function note(overrides: Partial<{ id: string; title: string }> = {}) {
  return {
    id: overrides.id ?? "note-1",
    title: overrides.title ?? "Grocery list",
    content: { type: "doc", content: [] },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    tags: [],
  };
}

function notesPage(
  overrides: Partial<{ data: unknown[]; hasNextPage: boolean; hasPreviousPage: boolean }> = {},
) {
  return {
    data: overrides.data ?? [note()],
    meta: {
      page: 1,
      pageSize: 20,
      total: overrides.data?.length ?? 1,
      totalPages: 1,
      hasNextPage: overrides.hasNextPage ?? false,
      hasPreviousPage: overrides.hasPreviousPage ?? false,
    },
  };
}

function stubFetch(notesResponseFactory: (url: string) => unknown) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/tags")) {
      return { ok: true, status: 200, json: async () => tags };
    }
    return { ok: true, status: 200, json: async () => notesResponseFactory(url) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage(initialUrl: string, queryClient = createQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <NotesListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NotesListPage", () => {
  it("shows a loading indicator while the notes query is pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    renderPage("/");

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders a card per returned note", async () => {
    stubFetch(() =>
      notesPage({
        data: [note({ id: "n1", title: "Grocery list" }), note({ id: "n2", title: "Todo" })],
      }),
    );

    renderPage("/");

    await waitFor(() => expect(screen.getByText("Grocery list")).toBeInTheDocument());
    expect(screen.getByText("Todo")).toBeInTheDocument();
  });

  it("renders the true-empty state when there are no notes and no tag filter is active", async () => {
    stubFetch(() => notesPage({ data: [] }));

    renderPage("/");

    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
  });

  it("renders the filtered-zero-match state, with working Clear filters, when a tag filter matches nothing", async () => {
    const fetchMock = stubFetch((url) =>
      notesPage({ data: url.includes("tags=") ? [] : [note()] }),
    );

    renderPage("/?tags=work");

    await waitFor(() =>
      expect(screen.getByText(/no notes match your filters/i)).toBeInTheDocument(),
    );

    fetchMock.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.not.stringContaining("tags="),
        expect.anything(),
      ),
    );
  });

  it("shows a working Clear filters control when a tag filter is active and notes still match", async () => {
    const fetchMock = stubFetch(() => notesPage({ data: [note()] }));

    renderPage("/?tags=work");

    await waitFor(() => expect(screen.getByText("Grocery list")).toBeInTheDocument());

    const clearFiltersButton = screen.getByRole("button", { name: /clear filters/i });
    fetchMock.mockClear();
    await userEvent.click(clearFiltersButton);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.not.stringContaining("tags="),
        expect.anything(),
      ),
    );
  });

  it("does not show a Clear filters control when no tag filter is active", async () => {
    stubFetch(() => notesPage({ data: [note()] }));

    renderPage("/");

    await waitFor(() => expect(screen.getByText("Grocery list")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it("renders an error state when the notes query fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ code: "INTERNAL_ERROR", message: "boom" }),
      }),
    );

    renderPage("/", new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    await waitFor(() => expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument());
  });

  it("wires Prev/Next to meta.hasNextPage/hasPreviousPage and advances the page", async () => {
    const fetchMock = stubFetch((url) =>
      notesPage({ hasNextPage: !url.includes("page=2"), hasPreviousPage: url.includes("page=2") }),
    );

    renderPage("/");

    await waitFor(() => expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled());
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();

    fetchMock.mockClear();
    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("page=2"), expect.anything()),
    );
  });

  it("changing sort re-queries with the expected params and resets to page 1", async () => {
    const fetchMock = stubFetch(() => notesPage());

    renderPage("/?page=2");

    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

    fetchMock.mockClear();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /created, oldest first/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /page=1.*sortBy=createdAt.*sortDir=asc|sortBy=createdAt.*sortDir=asc.*page=1/,
        ),
        expect.anything(),
      ),
    );
  });

  it("still shows pagination controls on an empty page that has a previous page", async () => {
    stubFetch(() => notesPage({ data: [], hasPreviousPage: true, hasNextPage: false }));

    renderPage("/?page=3");

    await waitFor(() => expect(screen.getByText(/no notes yet/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("toggling a tag re-queries with the tag applied and resets to page 1", async () => {
    const fetchMock = stubFetch(() => notesPage());

    renderPage("/?page=2");

    const filterRegion = await waitFor(() => screen.getByRole("list", { name: /filter by tag/i }));
    fetchMock.mockClear();
    await userEvent.click(within(filterRegion).getByRole("button", { name: "work" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("tags=work"),
        expect.anything(),
      ),
    );
    const lastCallUrl = fetchMock.mock.calls.at(-1)?.[0] as string;
    expect(lastCallUrl).toContain("page=1");
  });
});
