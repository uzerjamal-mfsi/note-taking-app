import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { useHealthQuery } from "./use-health-query.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHealthQuery", () => {
  it("resolves through the shared QueryClient using its configured defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      }),
    );

    const queryClient = createQueryClient();
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);

    const { result } = renderHook(() => useHealthQuery(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ status: "ok" });
  });
});
