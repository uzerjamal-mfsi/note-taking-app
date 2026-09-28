import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { NoteDto } from "@note-taking-app/shared";
import { NoteCard } from "./NoteCard.js";

function makeNote(overrides: Partial<NoteDto> = {}): NoteDto {
  return {
    id: "note-1",
    title: "Grocery list",
    content: { type: "doc", content: [] },
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

function renderCard(note: NoteDto, referenceNow?: Date) {
  return render(
    <MemoryRouter>
      <NoteCard note={note} referenceNow={referenceNow} />
    </MemoryRouter>,
  );
}

describe("NoteCard", () => {
  it("renders the note's title", () => {
    renderCard(makeNote({ title: "Grocery list" }));

    expect(screen.getByText("Grocery list")).toBeInTheDocument();
  });

  it("renders as a link to the note's editor", () => {
    renderCard(makeNote({ id: "note-42" }));

    expect(screen.getByRole("link")).toHaveAttribute("href", "/notes/note-42");
  });

  it("renders one chip per tag with the tag's color applied", () => {
    renderCard(
      makeNote({
        tags: [
          { id: "tag-1", name: "work", color: "#FF0000" },
          { id: "tag-2", name: "urgent", color: "#00FF00" },
        ],
      }),
    );

    const workChip = screen.getByText("work");
    const urgentChip = screen.getByText("urgent");
    expect(workChip).toBeInTheDocument();
    expect(urgentChip).toBeInTheDocument();
    expect(workChip).toHaveStyle({ backgroundColor: "#FF0000" });
    expect(urgentChip).toHaveStyle({ backgroundColor: "#00FF00" });
  });

  it("renders a relative updated date derived from updatedAt", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    renderCard(makeNote({ updatedAt: threeDaysAgo }), now);

    expect(screen.getByText(/3 days ago/i)).toBeInTheDocument();
  });
});
