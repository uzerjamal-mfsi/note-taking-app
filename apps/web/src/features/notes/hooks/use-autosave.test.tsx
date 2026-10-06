import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../../lib/query-client.js";
import { updateNote } from "../api/notes-api.js";
import { useAutosave } from "./use-autosave.js";

vi.mock("../api/notes-api.js", () => ({
  updateNote: vi.fn(),
}));

const updateNoteMock = vi.mocked(updateNote);

const IDLE_MS = 1000;

function renderAutosave(noteId = "note-1") {
  const client = createQueryClient();
  return renderHook(() => useAutosave({ noteId, idleMs: IDLE_MS }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

const doc = { type: "doc", content: [{ type: "paragraph", content: [] }] };
const note = {
  id: "note-1",
  title: "Untitled",
  content: doc,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-27T00:00:00.000Z",
  tags: [],
};

async function flushTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  updateNoteMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutosave", () => {
  it("does not save while the idle timer has not yet elapsed", async () => {
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS - 1);

    expect(updateNoteMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("pending");
  });

  it("fires exactly one save after the idle period elapses", async () => {
    updateNoteMock.mockResolvedValue(note);
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS);

    expect(updateNoteMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledWith("note-1", { content: doc, tagIds: undefined });
  });

  it("resets the idle timer on continued edits, deferring the save", async () => {
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS - 1);
    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS - 1);

    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it("reports a saved status once the save succeeds", async () => {
    updateNoteMock.mockResolvedValue(note);
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS);

    expect(result.current.status).toBe("saved");
  });

  it("reports an error status and preserves pending content when the save fails", async () => {
    updateNoteMock.mockRejectedValue(new Error("network error"));
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS);

    expect(result.current.status).toBe("error");

    updateNoteMock.mockResolvedValue(note);
    act(() => {
      result.current.retry();
    });
    await flushMicrotasks();

    expect(updateNoteMock).toHaveBeenCalledTimes(2);
    expect(updateNoteMock).toHaveBeenLastCalledWith("note-1", { content: doc, tagIds: undefined });
    expect(result.current.status).toBe("saved");
  });

  it("re-attempts the save when the user edits again after a failure", async () => {
    updateNoteMock.mockRejectedValueOnce(new Error("network error"));
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS);
    expect(result.current.status).toBe("error");

    updateNoteMock.mockResolvedValue(note);
    const secondDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [] }, { type: "paragraph" }],
    };
    act(() => {
      result.current.scheduleSave(secondDoc);
    });
    await flushTimers(IDLE_MS);

    expect(updateNoteMock).toHaveBeenCalledTimes(2);
    expect(updateNoteMock).toHaveBeenLastCalledWith("note-1", {
      content: secondDoc,
      tagIds: undefined,
    });
  });

  it("exposes an immediate saveNow that bypasses the idle debounce", async () => {
    updateNoteMock.mockResolvedValue(note);
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    act(() => {
      result.current.saveNow({ tagIds: ["tag-1"] });
    });
    await flushMicrotasks();

    expect(updateNoteMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledWith("note-1", { content: doc, tagIds: ["tag-1"] });
  });

  it("flushes a pending save immediately on unmount", async () => {
    updateNoteMock.mockResolvedValue(note);
    const { result, unmount } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    expect(updateNoteMock).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(updateNoteMock).toHaveBeenCalledWith("note-1", { content: doc, tagIds: undefined });
  });

  it("does nothing on unmount when there is nothing unsaved", async () => {
    const { unmount } = renderAutosave();

    await act(async () => {
      unmount();
    });

    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it("registers a beforeunload listener only while dirty, and removes it once saved", async () => {
    updateNoteMock.mockResolvedValue(note);
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { result } = renderAutosave();

    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.anything());

    act(() => {
      result.current.scheduleSave(doc);
    });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    await flushTimers(IDLE_MS);

    expect(result.current.status).toBe("saved");
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("useAutosave flushPending and cancelPendingSave", () => {
  it("flushPending sends the pending content immediately", async () => {
    updateNoteMock.mockResolvedValue(note);
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await act(async () => {
      await result.current.flushPending();
    });

    expect(updateNoteMock).toHaveBeenCalledTimes(1);
    expect(updateNoteMock).toHaveBeenCalledWith("note-1", { content: doc, tagIds: undefined });
    expect(result.current.status).toBe("saved");
  });

  it("flushPending is a no-op when nothing is dirty", async () => {
    const { result } = renderAutosave();

    await act(async () => {
      await result.current.flushPending();
    });

    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it("flushPending does not resend content that was already saved", async () => {
    updateNoteMock.mockResolvedValue(note);
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS);
    await act(async () => {
      await result.current.flushPending();
    });

    expect(updateNoteMock).toHaveBeenCalledTimes(1);
  });

  it("flushPending rejects on failure and keeps the content dirty for a retry", async () => {
    updateNoteMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(note);
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await act(async () => {
      await expect(result.current.flushPending()).rejects.toThrow("boom");
    });
    expect(result.current.status).toBe("error");

    await act(async () => {
      await result.current.flushPending();
    });

    expect(updateNoteMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("flushPending waits for an in-flight save before resolving", async () => {
    let resolveSave: (value: typeof note) => void = () => {};
    updateNoteMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    await flushTimers(IDLE_MS);
    let settled = false;
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.flushPending().then(() => {
        settled = true;
      });
    });
    await flushMicrotasks();
    expect(settled).toBe(false);

    await act(async () => {
      resolveSave(note);
      await pending;
    });

    expect(settled).toBe(true);
    expect(updateNoteMock).toHaveBeenCalledTimes(1);
  });

  it("cancelPendingSave stops a scheduled save and resets status", async () => {
    const { result } = renderAutosave();

    act(() => {
      result.current.scheduleSave(doc);
    });
    act(() => {
      result.current.cancelPendingSave();
    });
    await flushTimers(IDLE_MS * 2);

    expect(updateNoteMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });
});
