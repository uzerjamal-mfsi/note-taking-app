import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotesEmptyState } from "./NotesEmptyState.js";

describe("NotesEmptyState", () => {
  it("shows a message indicating the user has no notes yet", () => {
    render(<NotesEmptyState />);

    expect(screen.getByText(/no notes yet/i)).toBeInTheDocument();
  });
});
