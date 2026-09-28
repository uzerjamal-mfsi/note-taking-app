import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotesPagination } from "./NotesPagination.js";

describe("NotesPagination", () => {
  it("disables Previous when hasPreviousPage is false", () => {
    render(<NotesPagination page={1} hasNextPage hasPreviousPage={false} onPageChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("disables Next when hasNextPage is false", () => {
    render(<NotesPagination page={2} hasNextPage={false} hasPreviousPage onPageChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous/i })).toBeEnabled();
  });

  it("calls onPageChange with page + 1 when Next is activated", async () => {
    const onPageChange = vi.fn();
    render(<NotesPagination page={2} hasNextPage hasPreviousPage onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("calls onPageChange with page - 1 when Previous is activated", async () => {
    const onPageChange = vi.fn();
    render(<NotesPagination page={2} hasNextPage hasPreviousPage onPageChange={onPageChange} />);

    await userEvent.click(screen.getByRole("button", { name: /previous/i }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});
