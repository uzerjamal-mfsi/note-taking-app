import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesSortControl } from "./NotesSortControl.js";

describe("NotesSortControl", () => {
  it("shows the currently active sort as selected", () => {
    render(<NotesSortControl sortBy="createdAt" sortDir="asc" onSortChange={vi.fn()} />);

    expect(screen.getByRole("combobox")).toHaveTextContent(/created, oldest first/i);
  });

  it("renders the four sort options and calls onSortChange with the matching values", async () => {
    const onSortChange = vi.fn();
    render(<NotesSortControl sortBy="updatedAt" sortDir="desc" onSortChange={onSortChange} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(screen.getByRole("option", { name: /updated, newest first/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /updated, oldest first/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /created, newest first/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /created, oldest first/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: /created, oldest first/i }));

    expect(onSortChange).toHaveBeenCalledWith("createdAt", "asc");
  });
});
