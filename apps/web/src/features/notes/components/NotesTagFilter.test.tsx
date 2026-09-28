import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TagDto } from "@note-taking-app/shared";
import { NotesTagFilter } from "./NotesTagFilter.js";

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

describe("NotesTagFilter", () => {
  it("renders one toggle per tag with aria-pressed reflecting the selected set", () => {
    render(
      <NotesTagFilter
        tags={[makeTag({ id: "tag-1", name: "work" }), makeTag({ id: "tag-2", name: "personal" })]}
        selectedTags={["work"]}
        onToggleTag={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "work" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "personal" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onToggleTag with the tag's name when clicked", async () => {
    const onToggleTag = vi.fn();
    render(
      <NotesTagFilter
        tags={[makeTag({ name: "work" })]}
        selectedTags={[]}
        onToggleTag={onToggleTag}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "work" }));

    expect(onToggleTag).toHaveBeenCalledWith("work");
  });

  it("renders nothing when the tag list is empty", () => {
    const { container } = render(
      <NotesTagFilter tags={[]} selectedTags={[]} onToggleTag={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
