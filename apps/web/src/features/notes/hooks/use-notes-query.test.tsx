import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { useNotesQuery } from "./use-notes-query.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function page(overrides: Partial<{ data: unknown[]; hasNextPage: boolean }> = {}) {
  return {
    data: overrides.data ?? [],
    meta: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: overrides.hasNextPage ?? false,
      hasPreviousPage: false,
    },
  };
}

describe("useNotesQuery", () => {
  it("calls fetchNotes with the given params and resolves with the response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => page() });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () => useNotesQuery({ page: 1, sortBy: "updatedAt", sortDir: "desc", tags: [] }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/notes?"), expect.anything());
    expect(result.current.data).toEqual(page());
  });

  it("uses a query key that includes page, sortBy, sortDir, and tags", async () => {
    const queryClient = createQueryClient();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => page() }),
    );

    const { result } = renderHook(
      () => useNotesQuery({ page: 2, sortBy: "createdAt", sortDir: "asc", tags: ["work"] }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cachedQueries = queryClient.getQueryCache().findAll();
    expect(cachedQueries).toHaveLength(1);
    expect(cachedQueries[0]?.queryKey).toEqual([
      "notes",
      { page: 2, sortBy: "createdAt", sortDir: "asc", tags: ["work"] },
    ]);
  });

  it("keeps previous data visible while a new page is loading", async () => {
    const queryClient = createQueryClient();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => page({ hasNextPage: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ pageNum }) =>
        useNotesQuery({ page: pageNum, sortBy: "updatedAt", sortDir: "desc", tags: [] }),
      {
        initialProps: { pageNum: 1 },
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const firstPageData = result.current.data;

    let resolveNext!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNext = () => resolve({ ok: true, status: 200, json: async () => page() });
        }),
    );

    rerender({ pageNum: 2 });

    expect(result.current.isFetching).toBe(true);
    expect(result.current.data).toEqual(firstPageData);

    resolveNext(undefined);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });
});
