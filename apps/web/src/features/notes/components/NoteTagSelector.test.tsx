import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TagDto } from "@note-taking-app/shared";
import { NoteTagSelector } from "./NoteTagSelector.js";

function makeTag(overrides: Partial<TagDto> = {}): TagDto {
  return {
    id: "tag-1",
    name: "work",
    color: "#FF0000",
    createdAt: "2026-01-01T00:00:00.000Z",
    noteCount: 2,
    ...overrides,
  };
}

describe("NoteTagSelector", () => {
  it("shows the note's currently assigned tags as selected", () => {
    render(
      <NoteTagSelector
        tags={[makeTag({ id: "tag-1", name: "work" }), makeTag({ id: "tag-2", name: "personal" })]}
        selectedTagIds={["tag-1"]}
        onToggleTag={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "work" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "personal" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onToggleTag with the tag's id when clicked", async () => {
    const onToggleTag = vi.fn();
    render(
      <NoteTagSelector
        tags={[makeTag({ id: "tag-1", name: "work" })]}
        selectedTagIds={[]}
        onToggleTag={onToggleTag}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "work" }));

    expect(onToggleTag).toHaveBeenCalledWith("tag-1");
  });

  it("renders nothing when the user has no tags", () => {
    const { container } = render(
      <NoteTagSelector tags={[]} selectedTagIds={[]} onToggleTag={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
