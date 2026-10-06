import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { getNoteVersion, listNoteVersions } from "../api/notes-history-api.js";
import { useNoteVersionQuery, useNoteVersionsQuery } from "./use-note-versions.js";

vi.mock("../api/notes-history-api.js", () => ({
  listNoteVersions: vi.fn(),
  getNoteVersion: vi.fn(),
  restoreNoteVersion: vi.fn(),
}));
const listMock = vi.mocked(listNoteVersions);
const getMock = vi.mocked(getNoteVersion);

function setup() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const summary = { id: "v1", noteId: "n1", title: "T", createdAt: "2026-10-06T00:00:00.000Z" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useNoteVersionsQuery", () => {
  it("makes no request while disabled", async () => {
    const { wrapper } = setup();

    renderHook(() => useNoteVersionsQuery("n1", { enabled: false }), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(listMock).not.toHaveBeenCalled();
  });

  it("returns the versions when enabled", async () => {
    listMock.mockResolvedValue([summary]);
    const { wrapper } = setup();

    const { result } = renderHook(() => useNoteVersionsQuery("n1", { enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listMock).toHaveBeenCalledWith("n1");
    expect(result.current.data).toEqual([summary]);
  });

  it("does not retry a 404 (exactly one request)", async () => {
    listMock.mockRejectedValue({ status: 404, code: "NOT_FOUND", message: "no" });
    const { wrapper } = setup();

    const { result } = renderHook(() => useNoteVersionsQuery("n1", { enabled: true }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(404);
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});

describe("useNoteVersionQuery", () => {
  it("does not run while no version is selected", async () => {
    const { wrapper } = setup();

    renderHook(() => useNoteVersionQuery("n1", null), { wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(getMock).not.toHaveBeenCalled();
  });

  it("fetches the selected version", async () => {
    getMock.mockResolvedValue({ ...summary, content: { type: "doc" } });
    const { wrapper } = setup();

    const { result } = renderHook(() => useNoteVersionQuery("n1", "v1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("n1", "v1");
  });

  it("does not retry a 404 (exactly one request)", async () => {
    getMock.mockRejectedValue({ status: 404, code: "NOT_FOUND", message: "no" });
    const { wrapper } = setup();

    const { result } = renderHook(() => useNoteVersionQuery("n1", "v1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
