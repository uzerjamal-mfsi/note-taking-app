import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { useTagsQuery } from "./use-tags-query.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTagsQuery", () => {
  it("resolves with the caller's tags", async () => {
    const tags = [
      {
        id: "tag-1",
        name: "work",
        color: "#FF0000",
        createdAt: "2026-01-01T00:00:00.000Z",
        noteCount: 3,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => tags }),
    );

    const { result } = renderHook(() => useTagsQuery(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(tags);
  });

  it("exposes isLoading before the request resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const { result } = renderHook(() => useTagsQuery(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
      ),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("exposes isError when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ code: "INTERNAL_ERROR", message: "Something went wrong" }),
      }),
    );

    const noRetryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useTagsQuery(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={noRetryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
