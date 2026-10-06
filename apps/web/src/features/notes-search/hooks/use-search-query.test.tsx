import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { useSearchQuery } from "./use-search-query.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function page(overrides: Partial<{ data: unknown[] }> = {}) {
  return {
    data: overrides.data ?? [],
    meta: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

function withClient() {
  const queryClient = createQueryClient();
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("useSearchQuery", () => {
  it("calls fetchSearchResults and resolves with the response when q is non-blank", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => page() });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = withClient();

    const { result } = renderHook(() => useSearchQuery({ q: "grocery", page: 1, pageSize: 20 }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/notes/search?"),
      expect.anything(),
    );
    expect(result.current.data).toEqual(page());
  });

  it("is disabled and issues no request when q is blank", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = withClient();

    const { result } = renderHook(() => useSearchQuery({ q: "   ", page: 1, pageSize: 20 }), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces an error when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ code: "INTERNAL_ERROR", message: "boom" }),
      }),
    );
    const noRetryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSearchQuery({ q: "grocery", page: 1, pageSize: 20 }), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={noRetryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
