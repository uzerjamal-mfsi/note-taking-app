import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClearFiltersButton } from "./ClearFiltersButton.js";

describe("ClearFiltersButton", () => {
  it("calls onClearFilters when activated", async () => {
    const onClearFilters = vi.fn();
    render(<ClearFiltersButton onClearFilters={onClearFilters} />);

    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
