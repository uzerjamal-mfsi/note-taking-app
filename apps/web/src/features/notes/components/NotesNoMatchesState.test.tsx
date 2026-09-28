import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesNoMatchesState } from "./NotesNoMatchesState.js";

describe("NotesNoMatchesState", () => {
  it("shows a message indicating no notes match the current filters", () => {
    render(<NotesNoMatchesState onClearFilters={vi.fn()} />);

    expect(screen.getByText(/no notes match your filters/i)).toBeInTheDocument();
  });

  it("calls onClearFilters when the Clear filters button is activated", async () => {
    const onClearFilters = vi.fn();
    render(<NotesNoMatchesState onClearFilters={onClearFilters} />);

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
