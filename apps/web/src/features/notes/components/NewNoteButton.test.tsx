import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { createNote } from "../api/notes-api.js";
import { NewNoteButton } from "./NewNoteButton.js";

vi.mock("../api/notes-api.js", () => ({
  createNote: vi.fn(),
}));

const createNoteMock = vi.mocked(createNote);

function renderButton() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<NewNoteButton />} />
          <Route path="/notes/:noteId" element={<p>editor for note</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  createNoteMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NewNoteButton", () => {
  it("creates a note with a minimal starter document and navigates to its editor", async () => {
    createNoteMock.mockResolvedValue({
      id: "note-99",
      title: "Untitled",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
      tags: [],
    });

    renderButton();

    await userEvent.click(screen.getByRole("button", { name: "New note" }));

    expect(createNoteMock).toHaveBeenCalledWith({ type: "doc", content: [{ type: "paragraph" }] });
    await waitFor(() => expect(screen.getByText("editor for note")).toBeInTheDocument());
  });

  it("shows an error and does not navigate when creation fails", async () => {
    createNoteMock.mockRejectedValue(new Error("network error"));

    renderButton();
    await userEvent.click(screen.getByRole("button", { name: "New note" }));

    await waitFor(() => expect(screen.getByText(/couldn't create/i)).toBeInTheDocument());
    expect(screen.queryByText("editor for note")).not.toBeInTheDocument();
  });
});
