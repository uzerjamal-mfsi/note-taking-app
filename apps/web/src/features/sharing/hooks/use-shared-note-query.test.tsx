import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { getSharedNote } from "../api/sharing-api.js";
import { useSharedNoteQuery } from "./use-shared-note-query.js";

vi.mock("../api/sharing-api.js", () => ({ getSharedNote: vi.fn() }));
const getMock = vi.mocked(getSharedNote);

function setup() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useSharedNoteQuery", () => {
  it("returns the shared note on success", async () => {
    getMock.mockResolvedValue({ title: "T", content: { type: "doc" } });
    const { wrapper } = setup();

    const { result } = renderHook(() => useSharedNoteQuery("tok"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("tok");
    expect(result.current.data?.title).toBe("T");
  });

  it.each([404, 429])("does not retry a %i (exactly one request)", async (status) => {
    getMock.mockRejectedValue({ status, code: "X", message: "no" });
    const { wrapper } = setup();

    const { result } = renderHook(() => useSharedNoteQuery("tok"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(status);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("does not refetch on window focus", async () => {
    getMock.mockResolvedValue({ title: "T", content: { type: "doc" } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useSharedNoteQuery("tok"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
