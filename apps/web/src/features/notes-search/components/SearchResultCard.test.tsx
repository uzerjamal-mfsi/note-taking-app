import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { SearchResultDto } from "@note-taking-app/shared";
import { SearchResultCard } from "./SearchResultCard.js";

function makeResult(overrides: Partial<SearchResultDto> = {}): SearchResultDto {
  return {
    id: "note-1",
    title: "Grocery list",
    titleMatches: [],
    snippet: "",
    snippetMatches: [],
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

function renderCard(result: SearchResultDto) {
  return render(
    <MemoryRouter>
      <SearchResultCard result={result} />
    </MemoryRouter>,
  );
}

describe("SearchResultCard", () => {
  it("renders the title with the matched range highlighted", () => {
    renderCard(makeResult({ title: "Grocery list", titleMatches: [{ start: 0, end: 7 }] }));

    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("Grocery");
    expect(marks[0]?.closest('[data-slot="card-title"]')).not.toBeNull();
  });

  it("renders the snippet with highlighted matches when snippet is non-empty", () => {
    renderCard(
      makeResult({
        snippet: "buy eggs and milk",
        snippetMatches: [{ start: 4, end: 8 }],
      }),
    );

    expect(screen.getByText("buy", { exact: false })).toBeInTheDocument();
    const marks = document.querySelectorAll("mark");
    expect(Array.from(marks).some((mark) => mark.textContent === "eggs")).toBe(true);
  });

  it("omits the snippet line when snippet is empty", () => {
    renderCard(makeResult({ snippet: "" }));

    expect(document.querySelectorAll("mark")).toHaveLength(0);
  });

  it("links to the note's editor", () => {
    renderCard(makeResult({ id: "note-42" }));

    expect(screen.getByRole("link")).toHaveAttribute("href", "/notes/note-42");
  });

  it("renders one chip per tag with the tag's color applied", () => {
    renderCard(
      makeResult({
        tags: [
          { id: "tag-1", name: "work", color: "#FF0000" },
          { id: "tag-2", name: "urgent", color: "#00FF00" },
        ],
      }),
    );

    const workChip = screen.getByText("work");
    const urgentChip = screen.getByText("urgent");
    expect(workChip).toHaveStyle({ backgroundColor: "#FF0000" });
    expect(urgentChip).toHaveStyle({ backgroundColor: "#00FF00" });
  });

  it("renders a relative updated date derived from updatedAt", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    render(
      <MemoryRouter>
        <SearchResultCard result={makeResult({ updatedAt: threeDaysAgo })} referenceNow={now} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/3 days ago/i)).toBeInTheDocument();
  });

  it("formats a date far in the past in years", () => {
    const now = new Date("2026-09-27T00:00:00.000Z");
    const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();

    render(
      <MemoryRouter>
        <SearchResultCard result={makeResult({ updatedAt: twoYearsAgo })} referenceNow={now} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/years ago/i)).toBeInTheDocument();
  });
});
