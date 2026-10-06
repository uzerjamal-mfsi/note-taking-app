import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useNotesListParams } from "./use-notes-list-params.js";

function renderWithUrl(initialUrl: string) {
  return renderHook(() => useNotesListParams(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
    ),
  });
}

describe("useNotesListParams", () => {
  it("defaults to page 1, updatedAt desc, and no tags when the URL has no relevant params", () => {
    const { result } = renderWithUrl("/");

    expect(result.current.page).toBe(1);
    expect(result.current.sortBy).toBe("updatedAt");
    expect(result.current.sortDir).toBe("desc");
    expect(result.current.tags).toEqual([]);
  });

  it("parses valid page/sortBy/sortDir/tags from the URL", () => {
    const { result } = renderWithUrl("/?page=3&sortBy=createdAt&sortDir=asc&tags=work,personal");

    expect(result.current.page).toBe(3);
    expect(result.current.sortBy).toBe("createdAt");
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.tags).toEqual(["work", "personal"]);
  });

  it("falls back to the default page when the URL value is not a positive integer", () => {
    const { result } = renderWithUrl("/?page=not-a-number");

    expect(result.current.page).toBe(1);
  });

  it("falls back to the default sort when the URL value is unrecognized", () => {
    const { result } = renderWithUrl("/?sortBy=bogus&sortDir=sideways");

    expect(result.current.sortBy).toBe("updatedAt");
    expect(result.current.sortDir).toBe("desc");
  });

  it("setPage updates only the page param", () => {
    const { result } = renderWithUrl("/?sortBy=createdAt&sortDir=asc");

    act(() => result.current.setPage(2));

    expect(result.current.page).toBe(2);
    expect(result.current.sortBy).toBe("createdAt");
    expect(result.current.sortDir).toBe("asc");
  });

  it("setSort updates sortBy/sortDir and resets page to 1", () => {
    const { result } = renderWithUrl("/?page=4");

    act(() => result.current.setSort("createdAt", "asc"));

    expect(result.current.sortBy).toBe("createdAt");
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.page).toBe(1);
  });

  it("toggleTag adds a tag not yet selected and resets page to 1", () => {
    const { result } = renderWithUrl("/?page=2");

    act(() => result.current.toggleTag("work"));

    expect(result.current.tags).toEqual(["work"]);
    expect(result.current.page).toBe(1);
  });

  it("toggleTag removes a tag already selected and resets page to 1", () => {
    const { result } = renderWithUrl("/?page=2&tags=work,personal");

    act(() => result.current.toggleTag("work"));

    expect(result.current.tags).toEqual(["personal"]);
    expect(result.current.page).toBe(1);
  });

  it("clearFilters removes all tags and resets page to 1", () => {
    const { result } = renderWithUrl("/?page=2&tags=work,personal");

    act(() => result.current.clearFilters());

    expect(result.current.tags).toEqual([]);
    expect(result.current.page).toBe(1);
  });

  it("defaults q to an empty string when the URL has no q param", () => {
    const { result } = renderWithUrl("/");

    expect(result.current.q).toBe("");
  });

  it("parses q from the URL", () => {
    const { result } = renderWithUrl("/?q=grocery&page=2");

    expect(result.current.q).toBe("grocery");
    expect(result.current.page).toBe(2);
  });

  it("trims a whitespace-only q read from the URL down to empty", () => {
    const { result } = renderWithUrl("/?q=%20%20");

    expect(result.current.q).toBe("");
  });

  it("setQuery trims a whitespace-only value down to empty", () => {
    const { result } = renderWithUrl("/");

    act(() => result.current.setQuery("   "));

    expect(result.current.q).toBe("");
  });

  it("setQuery writes q and resets page to 1", () => {
    const { result } = renderWithUrl("/?page=3&sortBy=createdAt&sortDir=asc&tags=work");

    act(() => result.current.setQuery("grocery"));

    expect(result.current.q).toBe("grocery");
    expect(result.current.page).toBe(1);
    expect(result.current.sortBy).toBe("createdAt");
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.tags).toEqual(["work"]);
  });

  it("setQuery('') clears q from the URL and resets page to 1", () => {
    const { result } = renderWithUrl("/?q=grocery&page=2");

    act(() => result.current.setQuery(""));

    expect(result.current.q).toBe("");
    expect(result.current.page).toBe(1);
  });

  it("reload/back-forward restore q by reading it back from the URL", () => {
    const { result, rerender } = renderHook(() => useNotesListParams(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/?q=grocery&page=2"]}>{children}</MemoryRouter>
      ),
    });

    rerender();

    expect(result.current.q).toBe("grocery");
    expect(result.current.page).toBe(2);
  });
});
