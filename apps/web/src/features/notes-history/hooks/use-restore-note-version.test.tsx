import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { restoreNoteVersion } from "../api/notes-history-api.js";
import { useRestoreNoteVersionMutation } from "./use-restore-note-version.js";

vi.mock("../api/notes-history-api.js", () => ({
  listNoteVersions: vi.fn(),
  getNoteVersion: vi.fn(),
  restoreNoteVersion: vi.fn(),
}));
const restoreMock = vi.mocked(restoreNoteVersion);

const note = {
  id: "n1",
  title: "Restored",
  content: { type: "doc", content: [] },
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
  tags: [],
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

describe("useRestoreNoteVersionMutation", () => {
  it("caches the returned note and invalidates versions and the notes list on success", async () => {
    restoreMock.mockResolvedValue(note);
    const { client, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRestoreNoteVersionMutation("n1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("v1");
    });

    expect(restoreMock).toHaveBeenCalledWith("n1", "v1");
    expect(client.getQueryData(["note", "n1"])).toEqual(note);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notes", "n1", "versions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notes"] });
  });

  it("neither updates the cache nor invalidates on failure", async () => {
    restoreMock.mockRejectedValue({ status: 500, code: "X", message: "boom" });
    const { client, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useRestoreNoteVersionMutation("n1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("v1").catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["note", "n1"])).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
