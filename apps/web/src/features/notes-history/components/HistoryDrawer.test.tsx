import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteDto, NoteVersionDto, NoteVersionSummaryDto } from "@note-taking-app/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getNoteVersion, listNoteVersions, restoreNoteVersion } from "../api/notes-history-api.js";
import { HistoryDrawer } from "./HistoryDrawer.js";

vi.mock("../api/notes-history-api.js", () => ({
  listNoteVersions: vi.fn(),
  getNoteVersion: vi.fn(),
  restoreNoteVersion: vi.fn(),
}));

const listMock = vi.mocked(listNoteVersions);
const getMock = vi.mocked(getNoteVersion);
const restoreMock = vi.mocked(restoreNoteVersion);

const summaries: NoteVersionSummaryDto[] = [
  { id: "v3", noteId: "note-1", title: "Newest title", createdAt: "2026-10-06T12:00:00.000Z" },
  { id: "v2", noteId: "note-1", title: "Middle title", createdAt: "2026-10-05T12:00:00.000Z" },
  { id: "v1", noteId: "note-1", title: "Oldest title", createdAt: "2026-10-04T12:00:00.000Z" },
];

const version: NoteVersionDto = {
  ...summaries[2]!,
  content: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Oldest title" }] },
      { type: "paragraph", content: [{ type: "text", text: "Old body text" }] },
    ],
  },
};

const restoredNote: NoteDto = {
  id: "note-1",
  title: "Oldest title",
  content: version.content,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-06T13:00:00.000Z",
  tags: [],
};

function notFound() {
  return { status: 404, code: "NOT_FOUND", message: "Not found" };
}

function serverError() {
  return { status: 500, code: "INTERNAL", message: "boom" };
}

function renderDrawer(
  overrides: Partial<{
    onBeforeRestore: () => Promise<void>;
    onRestored: (note: NoteDto) => void;
  }> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const onBeforeRestore = overrides.onBeforeRestore ?? vi.fn().mockResolvedValue(undefined);
  const onRestored = overrides.onRestored ?? vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <HistoryDrawer noteId="note-1" onBeforeRestore={onBeforeRestore} onRestored={onRestored} />
    </QueryClientProvider>,
  );
  return { client, invalidate, onBeforeRestore, onRestored, ...utils };
}

async function openDrawer(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: "History" }));
}

async function openPreview(u: ReturnType<typeof userEvent.setup>) {
  await openDrawer(u);
  await u.click(await screen.findByRole("button", { name: /Oldest title/ }));
  await screen.findByText("Old body text");
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HistoryDrawer - version list", () => {
  it("makes no request until opened", () => {
    listMock.mockResolvedValue(summaries);
    renderDrawer();

    expect(listMock).not.toHaveBeenCalled();
  });

  it("shows a loading indicator while the list is loading", async () => {
    listMock.mockReturnValue(new Promise(() => {}));
    const u = userEvent.setup();
    renderDrawer();

    await openDrawer(u);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading");
  });

  it("lists versions in the order returned with title, time and the retention note", async () => {
    listMock.mockResolvedValue(summaries);
    const u = userEvent.setup();
    renderDrawer();

    await openDrawer(u);

    const rows = await screen.findAllByRole("button", { name: /title/ });
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Newest title"),
      expect.stringContaining("Middle title"),
      expect.stringContaining("Oldest title"),
    ]);
    expect(listMock).toHaveBeenCalledWith("note-1");
    expect(screen.getAllByText(/2026/)).toHaveLength(3);
    expect(screen.getByText(/kept for 30 days/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no versions", async () => {
    listMock.mockResolvedValue([]);
    const u = userEvent.setup();
    renderDrawer();

    await openDrawer(u);

    expect(await screen.findByText(/no earlier versions/i)).toBeInTheDocument();
  });

  it("shows an error with a working Retry when the list fails", async () => {
    listMock.mockRejectedValueOnce(serverError()).mockResolvedValueOnce(summaries);
    const u = userEvent.setup();
    renderDrawer();

    await openDrawer(u);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
    await u.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Newest title")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});

describe("HistoryDrawer - preview", () => {
  it("shows the selected version's title and body read-only", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    const u = userEvent.setup();
    renderDrawer();

    await openPreview(u);

    expect(getMock).toHaveBeenCalledWith("note-1", "v1");
    expect(screen.getByRole("heading", { name: "Oldest title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("cannot be edited and sends no update", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    const u = userEvent.setup();
    renderDrawer();
    await openPreview(u);

    const bodyText = screen.getByText("Old body text");
    await u.click(bodyText);
    await u.keyboard("typed");

    expect(screen.getByText("Old body text")).toBeInTheDocument();
    expect(screen.queryByText(/typed/)).not.toBeInTheDocument();
    expect(restoreMock).not.toHaveBeenCalled();
    expect(bodyText.closest("[contenteditable]")).toHaveAttribute("contenteditable", "false");
  });

  it("returns to the list with Back without modifying the note", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    const u = userEvent.setup();
    renderDrawer();
    await openPreview(u);

    await u.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByText("Newest title")).toBeInTheDocument();
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("shows a retryable error and keeps the list reachable when the preview fails", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockRejectedValueOnce(serverError()).mockResolvedValueOnce(version);
    const u = userEvent.setup();
    renderDrawer();
    await openDrawer(u);
    await u.click(await screen.findByRole("button", { name: /Oldest title/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Old body text")).toBeInTheDocument();
  });

  it("resets the selection when the drawer is closed and reopened", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    const u = userEvent.setup();
    renderDrawer();
    await openPreview(u);

    await u.keyboard("{Escape}");
    await openDrawer(u);

    expect(await screen.findByText("Newest title")).toBeInTheDocument();
    expect(screen.queryByText("Old body text")).not.toBeInTheDocument();
  });
});

describe("HistoryDrawer - restore", () => {
  it("shows the hint and no confirmation dialog", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    const u = userEvent.setup();
    renderDrawer();
    await openPreview(u);

    expect(screen.getByText("Your current version will be saved to history.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toHaveAccessibleDescription(
      "Your current version will be saved to history.",
    );
    await u.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("flushes first, restores, hands the note to onRestored and closes", async () => {
    const calls: string[] = [];
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    restoreMock.mockImplementation(async () => {
      calls.push("restore");
      return restoredNote;
    });
    const onBeforeRestore = vi.fn(async () => {
      calls.push("flush");
    });
    const onRestored = vi.fn();
    const u = userEvent.setup();
    renderDrawer({ onBeforeRestore, onRestored });
    await openPreview(u);

    await u.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(restoredNote));
    expect(calls).toEqual(["flush", "restore"]);
    expect(restoreMock).toHaveBeenCalledWith("note-1", "v1");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not restore and shows an error when the flush fails", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    const onBeforeRestore = vi.fn().mockRejectedValue(serverError());
    const onRestored = vi.fn();
    const u = userEvent.setup();
    renderDrawer({ onBeforeRestore, onRestored });
    await openPreview(u);

    await u.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/latest edits/i);
    expect(restoreMock).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
  });

  it("shows an error, re-enables Restore and does not call onRestored when the restore fails", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    restoreMock.mockRejectedValue(serverError());
    const onRestored = vi.fn();
    const u = userEvent.setup();
    renderDrawer({ onRestored });
    await openPreview(u);

    await u.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't restore/i);
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the refreshed list, including the pre-restore version, when reopened", async () => {
    const preRestore = {
      id: "v4",
      noteId: "note-1",
      title: "Pre-restore title",
      createdAt: "2026-10-06T13:00:00.000Z",
    };
    listMock.mockResolvedValueOnce(summaries).mockResolvedValue([preRestore, ...summaries]);
    getMock.mockResolvedValue(version);
    restoreMock.mockResolvedValue(restoredNote);
    const u = userEvent.setup();
    renderDrawer();
    await openPreview(u);

    await u.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openDrawer(u);

    expect(await screen.findByText("Pre-restore title")).toBeInTheDocument();
    expect(listMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("sends a single restore request on a double click", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    restoreMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(restoredNote), 30)),
    );
    const u = userEvent.setup();
    renderDrawer();
    await openPreview(u);

    await u.dblClick(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(restoreMock).toHaveBeenCalledTimes(1));
  });
});

describe("HistoryDrawer - 404 handling", () => {
  it("closes and invalidates the note and versions when the list is 404", async () => {
    listMock.mockRejectedValue(notFound());
    const u = userEvent.setup();
    const { invalidate } = renderDrawer();

    await openDrawer(u);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["note", "note-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notes", "note-1", "versions"] });
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });

  it("closes and invalidates when a single version is 404", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockRejectedValue(notFound());
    const u = userEvent.setup();
    const { invalidate } = renderDrawer();
    await openDrawer(u);

    await u.click(await screen.findByRole("button", { name: /Oldest title/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["note", "note-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notes", "note-1", "versions"] });
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });

  it("closes and invalidates when the restore is 404, without calling onRestored", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    restoreMock.mockRejectedValue(notFound());
    const onRestored = vi.fn();
    const u = userEvent.setup();
    const { invalidate } = renderDrawer({ onRestored });
    await openPreview(u);

    await u.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["note", "note-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notes", "note-1", "versions"] });
    expect(onRestored).not.toHaveBeenCalled();
    expect(restoreMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });
});

describe("HistoryDrawer - keyboard and ARIA", () => {
  it("opens with focus inside, closes on Escape and returns focus to the trigger", async () => {
    listMock.mockResolvedValue(summaries);
    const u = userEvent.setup();
    renderDrawer();
    const trigger = screen.getByRole("button", { name: "History" });

    trigger.focus();
    await u.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Version history" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await u.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("selects a version and restores using only the keyboard", async () => {
    listMock.mockResolvedValue(summaries);
    getMock.mockResolvedValue(version);
    restoreMock.mockResolvedValue(restoredNote);
    const onRestored = vi.fn();
    const u = userEvent.setup();
    renderDrawer({ onRestored });
    await openDrawer(u);

    const row = await screen.findByRole("button", { name: /Oldest title/ });
    row.focus();
    await u.keyboard("{Enter}");
    await screen.findByText("Old body text");
    screen.getByRole("button", { name: "Restore" }).focus();
    await u.keyboard("{Enter}");

    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(restoredNote));
  });

  it("announces loading via role=status and failures via role=alert", async () => {
    listMock.mockReturnValueOnce(new Promise(() => {}));
    const u = userEvent.setup();
    const { unmount } = renderDrawer();
    await openDrawer(u);
    expect(await screen.findByRole("status")).toBeInTheDocument();
    unmount();

    listMock.mockRejectedValue(serverError());
    renderDrawer();
    await openDrawer(userEvent.setup());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
