import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { highlightRanges } from "./highlight-ranges.js";

function renderHighlights(text: string, ranges: Array<{ start: number; end: number }>) {
  const { container } = render(<>{highlightRanges(text, ranges)}</>);
  return container;
}

describe("highlightRanges", () => {
  it("returns the plain text unchanged when there are no ranges", () => {
    const container = renderHighlights("Grocery list", []);
    expect(container.textContent).toBe("Grocery list");
    expect(container.querySelectorAll("mark")).toHaveLength(0);
  });

  it("wraps a single range in <mark>", () => {
    const container = renderHighlights("Grocery list", [{ start: 0, end: 7 }]);
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("Grocery");
    expect(container.textContent).toBe("Grocery list");
  });

  it("wraps multiple non-adjacent ranges in separate <mark>s", () => {
    const container = renderHighlights("eggs and milk and eggs", [
      { start: 0, end: 4 },
      { start: 18, end: 22 },
    ]);
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe("eggs");
    expect(marks[1]?.textContent).toBe("eggs");
    expect(container.textContent).toBe("eggs and milk and eggs");
  });

  it("handles a range touching the start and one touching the end of the string", () => {
    const container = renderHighlights("abcdef", [
      { start: 0, end: 1 },
      { start: 5, end: 6 },
    ]);
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe("a");
    expect(marks[1]?.textContent).toBe("f");
    expect(container.textContent).toBe("abcdef");
  });

  it("renders literal markup-like text as visible plain text, never interpreted as markup", () => {
    const container = renderHighlights("<script>alert(1)</script>", [{ start: 0, end: 8 }]);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("<script>alert(1)</script>");
    const marks = container.querySelectorAll("mark");
    expect(marks[0]?.textContent).toBe("<script>");
  });

  it("sorts unsorted ranges before rendering", () => {
    const container = renderHighlights("abcdef", [
      { start: 4, end: 6 },
      { start: 0, end: 2 },
    ]);
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe("ab");
    expect(marks[1]?.textContent).toBe("ef");
  });

  it("merges overlapping ranges instead of throwing", () => {
    const container = renderHighlights("abcdef", [
      { start: 0, end: 4 },
      { start: 2, end: 6 },
    ]);
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("abcdef");
  });

  it("clamps out-of-bounds ranges to the text length instead of throwing", () => {
    const container = renderHighlights("abc", [{ start: -5, end: 100 }]);
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("abc");
  });

  it("drops ranges that are empty or invalid after clamping", () => {
    const container = renderHighlights("abc", [{ start: 5, end: 6 }]);
    expect(container.querySelectorAll("mark")).toHaveLength(0);
    expect(container.textContent).toBe("abc");
  });
});
