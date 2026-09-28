import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("NoteCard", () => {
  it("renders the note's title", () => {
    render(<NoteCard note={makeNote({ title: "Grocery list" })} />);

    expect(screen.getByText("Grocery list")).toBeInTheDocument();
  });

  it("renders one chip per tag with the tag's color applied", () => {
    render(
      <NoteCard
        note={makeNote({
          tags: [
            { id: "tag-1", name: "work", color: "#FF0000" },
            { id: "tag-2", name: "urgent", color: "#00FF00" },
          ],
        })}
      />,
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

    render(<NoteCard note={makeNote({ updatedAt: threeDaysAgo })} referenceNow={now} />);

    expect(screen.getByText(/3 days ago/i)).toBeInTheDocument();
  });
});
