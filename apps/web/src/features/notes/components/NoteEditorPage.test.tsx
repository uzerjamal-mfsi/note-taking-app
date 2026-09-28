import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { deleteNote, getNote, updateNote } from "../api/notes-api.js";
import { fetchTags } from "../../tags/api/tags-api.js";
import { NoteEditorPage } from "./NoteEditorPage.js";

vi.mock("../api/notes-api.js", () => ({
  getNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));
vi.mock("../../tags/api/tags-api.js", () => ({
  fetchTags: vi.fn(),
}));

const getNoteMock = vi.mocked(getNote);
const updateNoteMock = vi.mocked(updateNote);
const deleteNoteMock = vi.mocked(deleteNote);
const fetchTagsMock = vi.mocked(fetchTags);

function makeNote(overrides: Partial<Awaited<ReturnType<typeof getNote>>> = {}) {
  return {
    id: "note-1",
    title: "Grocery list",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Grocery list" }] },
        { type: "paragraph", content: [{ type: "text", text: "Milk" }] },
      ],
    },
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

function renderPage(noteId = "note-1", client: QueryClient = createQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/notes/${noteId}`]}>
        <Routes>
          <Route path="/notes/:noteId" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getNoteMock.mockReset();
  updateNoteMock.mockReset();
  deleteNoteMock.mockReset();
  fetchTagsMock.mockReset();
  fetchTagsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NoteEditorPage", () => {
  it("shows a loading indicator while the note is being fetched", () => {
    getNoteMock.mockImplementation(() => new Promise(() => {}));

    renderPage();

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the note's first-node text as the title and the rest as the body", async () => {
    getNoteMock.mockResolvedValue(makeNote());

    renderPage();

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));
    expect(screen.getByText("Milk")).toBeInTheDocument();
  });

  it("shows a not-found state when the note doesn't exist, isn't owned, or was deleted", async () => {
    getNoteMock.mockRejectedValue({
      status: 404,
      code: "NOTE_NOT_FOUND",
      message: "Note not found",
    });
    const noRetryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderPage("note-1", noRetryClient);

    await waitFor(() => expect(screen.getByText(/note not found/i)).toBeInTheDocument());
  });

  it("autosaves after the user edits the title", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateNoteMock.mockResolvedValue(makeNote());
    getNoteMock.mockResolvedValue(makeNote());
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await u.clear(screen.getByLabelText("Title"));
    await u.type(screen.getByLabelText("Title"), "Shopping list");

    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(updateNoteMock).toHaveBeenCalled());
    const [, payload] = updateNoteMock.mock.calls.at(-1) as [string, { content: unknown }];
    const firstNode = (payload.content as { content: unknown[] }).content[0] as {
      content: { text: string }[];
    };
    expect(firstNode.content[0]?.text).toBe("Shopping list");
  });

  it("editing the body leaves the title input unchanged", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateNoteMock.mockResolvedValue(makeNote());
    getNoteMock.mockResolvedValue(makeNote());
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage();
    await waitFor(() => expect(screen.getByText("Milk")).toBeInTheDocument());

    await u.click(screen.getByText("Milk"));
    await u.type(screen.getByText("Milk"), " and eggs");

    await vi.advanceTimersByTimeAsync(2000);

    expect(screen.getByLabelText("Title")).toHaveValue("Grocery list");
  });

  it("still autosaves a valid non-empty document when the title is cleared and the body is empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const emptyNote = makeNote({
      title: "Untitled",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    getNoteMock.mockResolvedValue(emptyNote);
    updateNoteMock.mockResolvedValue(emptyNote);
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(""));

    await u.type(screen.getByLabelText("Title"), "x");
    await u.clear(screen.getByLabelText("Title"));
    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(updateNoteMock).toHaveBeenCalled());
    const [, payload] = updateNoteMock.mock.calls.at(-1) as [
      string,
      { content: { content: unknown[] } },
    ];
    expect(payload.content).toEqual({ type: "doc", content: expect.any(Array) });
    expect(payload.content.content.length).toBeGreaterThan(0);
  });

  it("shows saving/saved status around an autosave", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getNoteMock.mockResolvedValue(makeNote());
    let resolveUpdate: (value: ReturnType<typeof makeNote>) => void = () => {};
    updateNoteMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await u.type(screen.getByLabelText("Title"), "!");
    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(screen.getByText(/saving/i)).toBeInTheDocument());

    resolveUpdate(makeNote());
    await vi.advanceTimersByTimeAsync(0);

    await waitFor(() => expect(screen.getByText(/^saved$/i)).toBeInTheDocument());
  });

  it("shows an error with retry when the autosave fails, and retry re-attempts it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getNoteMock.mockResolvedValue(makeNote());
    updateNoteMock.mockRejectedValueOnce(new Error("network error"));
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await u.type(screen.getByLabelText("Title"), "!");
    await vi.advanceTimersByTimeAsync(2000);

    await waitFor(() => expect(screen.getByText(/couldn't save/i)).toBeInTheDocument());

    updateNoteMock.mockResolvedValue(makeNote());
    await u.click(screen.getByRole("button", { name: /retry/i }));
    await vi.advanceTimersByTimeAsync(0);

    await waitFor(() => expect(screen.getByText(/^saved$/i)).toBeInTheDocument());
  });
});

describe("NoteEditorPage tag assignment", () => {
  const tags = [
    {
      id: "tag-1",
      name: "work",
      color: "#FF0000",
      createdAt: "2026-01-01T00:00:00.000Z",
      noteCount: 1,
    },
    {
      id: "tag-2",
      name: "personal",
      color: "#00FF00",
      createdAt: "2026-01-01T00:00:00.000Z",
      noteCount: 1,
    },
  ];

  it("shows the user's tags with the note's currently assigned tags selected", async () => {
    fetchTagsMock.mockResolvedValue(tags);
    getNoteMock.mockResolvedValue(
      makeNote({ tags: [{ id: "tag-1", name: "work", color: "#FF0000" }] }),
    );

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "work" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: "personal" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("assigning a tag immediately saves, without waiting for the autosave idle period", async () => {
    fetchTagsMock.mockResolvedValue(tags);
    getNoteMock.mockResolvedValue(makeNote({ tags: [] }));
    updateNoteMock.mockResolvedValue(
      makeNote({ tags: [{ id: "tag-1", name: "work", color: "#FF0000" }] }),
    );

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "work" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "work" }));

    await waitFor(() => expect(updateNoteMock).toHaveBeenCalled());
    const [, payload] = updateNoteMock.mock.calls.at(-1) as [string, { tagIds?: string[] }];
    expect(payload.tagIds).toEqual(["tag-1"]);
    expect(screen.getByRole("button", { name: "work" })).toHaveAttribute("aria-pressed", "true");
  });

  it("removing a tag immediately saves with it excluded", async () => {
    fetchTagsMock.mockResolvedValue(tags);
    getNoteMock.mockResolvedValue(
      makeNote({ tags: [{ id: "tag-1", name: "work", color: "#FF0000" }] }),
    );
    updateNoteMock.mockResolvedValue(makeNote({ tags: [] }));

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "work" })).toHaveAttribute("aria-pressed", "true"),
    );

    await userEvent.click(screen.getByRole("button", { name: "work" }));

    await waitFor(() => expect(updateNoteMock).toHaveBeenCalled());
    const [, payload] = updateNoteMock.mock.calls.at(-1) as [string, { tagIds?: string[] }];
    expect(payload.tagIds).toEqual([]);
  });

  it("reverts the displayed selection when a tag toggle fails", async () => {
    fetchTagsMock.mockResolvedValue(tags);
    getNoteMock.mockResolvedValue(makeNote({ tags: [] }));
    updateNoteMock.mockRejectedValue(new Error("network error"));

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "work" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "work" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "work" })).toHaveAttribute("aria-pressed", "false"),
    );
  });

  it("renders no tag selector when the user has no tags", async () => {
    fetchTagsMock.mockResolvedValue([]);
    getNoteMock.mockResolvedValue(makeNote());

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));
    expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
  });
});

function NavigateButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      Navigate
    </button>
  );
}

describe("NoteEditorPage query/editor isolation", () => {
  it("does not overwrite in-progress edits when a background refetch resolves for the same note", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getNoteMock.mockResolvedValue(makeNote());
    const client = createQueryClient();
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderPage("note-1", client);
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await u.type(screen.getByLabelText("Title"), " (urgent)");
    expect(screen.getByLabelText("Title")).toHaveValue("Grocery list (urgent)");

    // Simulate a background refetch of the same note resolving with different
    // (stale, server-side-unchanged) content - must not clobber the user's edit.
    client.setQueryData(["note", "note-1"], makeNote({ title: "Grocery list" }));

    expect(screen.getByLabelText("Title")).toHaveValue("Grocery list (urgent)");
  });

  it("re-seeds the editor when navigating to a different note", async () => {
    getNoteMock.mockImplementation(async (id: string) =>
      id === "note-1"
        ? makeNote({ id: "note-1", title: "Grocery list" })
        : makeNote({
            id: "note-2",
            title: "Second note",
            content: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second note" }] }],
            },
          }),
    );

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/notes/note-1"]}>
          <NavigateButton to="/notes/note-2" />
          <Routes>
            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Navigate" }));

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Second note"));
  });
});

function renderWithHomeRoute(noteId = "note-1") {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[`/notes/${noteId}`]}>
        <Routes>
          <Route path="/" element={<p>notes list</p>} />
          <Route path="/notes/:noteId" element={<NoteEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NoteEditorPage delete", () => {
  it("requires confirmation before sending a delete request", async () => {
    getNoteMock.mockResolvedValue(makeNote());
    renderWithHomeRoute();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));

    expect(screen.getByText(/delete this note\?/i)).toBeInTheDocument();
    expect(deleteNoteMock).not.toHaveBeenCalled();
  });

  it("confirming delete sends DELETE and navigates to the notes list", async () => {
    getNoteMock.mockResolvedValue(makeNote());
    deleteNoteMock.mockResolvedValue(undefined);
    renderWithHomeRoute();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteNoteMock).toHaveBeenCalledWith("note-1"));
    await waitFor(() => expect(screen.getByText("notes list")).toBeInTheDocument());
  });

  it("canceling the confirmation sends no request and leaves the editor unchanged", async () => {
    getNoteMock.mockResolvedValue(makeNote());
    renderWithHomeRoute();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteNoteMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("Grocery list");
  });

  it("shows an error and stays on the editor when delete fails", async () => {
    getNoteMock.mockResolvedValue(makeNote());
    deleteNoteMock.mockRejectedValue(new Error("network error"));
    renderWithHomeRoute();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Grocery list"));

    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Title")).toHaveValue("Grocery list");
  });
});
