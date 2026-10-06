import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { createShareLink, getShareLink, revokeShareLink } from "../api/sharing-api.js";
import {
  shareLinkQueryKey,
  useCreateShareLinkMutation,
  useRevokeShareLinkMutation,
  useShareLinkQuery,
} from "./use-share-link.js";

vi.mock("../api/sharing-api.js", () => ({
  getShareLink: vi.fn(),
  createShareLink: vi.fn(),
  revokeShareLink: vi.fn(),
}));

const getMock = vi.mocked(getShareLink);
const createMock = vi.mocked(createShareLink);
const revokeMock = vi.mocked(revokeShareLink);

const link = {
  token: "tok",
  viewCount: 0,
  expiresAt: null,
  createdAt: "2026-10-06T00:00:00.000Z",
};

function setup() {
  const client = createQueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useShareLinkQuery", () => {
  it("does not fetch while disabled", () => {
    const { wrapper } = setup();

    renderHook(() => useShareLinkQuery("n1", { enabled: false }), { wrapper });

    expect(getMock).not.toHaveBeenCalled();
  });

  it("exposes null data for a note with no link", async () => {
    getMock.mockResolvedValue(null);
    const { wrapper } = setup();

    const { result } = renderHook(() => useShareLinkQuery("n1", { enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("exposes errors for non-404 failures", async () => {
    getMock.mockRejectedValue({ status: 500, code: "X", message: "boom" });
    const { wrapper, client } = setup();
    client.setDefaultOptions({ queries: { retry: false } });

    const { result } = renderHook(() => useShareLinkQuery("n1", { enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateShareLinkMutation", () => {
  it("caches the link and invalidates the share key on success", async () => {
    createMock.mockResolvedValue(link);
    const { wrapper, client, invalidate } = setup();
    const { result } = renderHook(() => useCreateShareLinkMutation("n1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(createMock).toHaveBeenCalledWith("n1", undefined);
    expect(client.getQueryData(shareLinkQueryKey("n1"))).toEqual(link);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notes", "n1", "share"] });
  });

  it("does not invalidate on failure", async () => {
    createMock.mockRejectedValue({ status: 422, code: "X", message: "bad" });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useCreateShareLinkMutation("n1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("2030-01-01T00:00:00.000Z").catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useRevokeShareLinkMutation", () => {
  it("clears the cached link and invalidates the share key on success", async () => {
    revokeMock.mockResolvedValue(undefined);
    const { wrapper, client, invalidate } = setup();
    client.setQueryData(shareLinkQueryKey("n1"), link);
    const { result } = renderHook(() => useRevokeShareLinkMutation("n1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(client.getQueryData(shareLinkQueryKey("n1"))).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notes", "n1", "share"] });
  });

  it("treats a 404 as success", async () => {
    revokeMock.mockRejectedValue({ status: 404, code: "NOT_FOUND", message: "gone" });
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useRevokeShareLinkMutation("n1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(client.getQueryData(shareLinkQueryKey("n1"))).toBeNull();
  });

  it("propagates other errors and does not invalidate", async () => {
    revokeMock.mockRejectedValue({ status: 500, code: "X", message: "boom" });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRevokeShareLinkMutation("n1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
