import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchNoResultsState } from "./SearchNoResultsState.js";

describe("SearchNoResultsState", () => {
  it("renders a message distinct from the notes list's empty states", () => {
    render(<SearchNoResultsState />);

    expect(screen.getByText("No notes matched your search.")).toBeInTheDocument();
  });
});
