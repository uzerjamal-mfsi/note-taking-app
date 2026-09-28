import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotesErrorState } from "./NotesErrorState.js";

describe("NotesErrorState", () => {
  it("shows a message that the notes could not be loaded", () => {
    render(<NotesErrorState />);

    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });
});
