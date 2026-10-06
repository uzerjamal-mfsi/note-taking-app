import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog.js";

function renderDialog() {
  return render(
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share note</DialogTitle>
          <DialogDescription>Manage the public link.</DialogDescription>
        </DialogHeader>
        <input aria-label="Field" />
        <DialogFooter>
          <DialogClose>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
}

describe("Dialog", () => {
  it("is closed until the trigger is activated", () => {
    renderDialog();

    expect(screen.queryByText("Share note")).not.toBeInTheDocument();
  });

  it("opens on trigger activation and exposes title and description via ARIA", async () => {
    renderDialog();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Share note" });
    expect(dialog).toHaveAccessibleDescription("Manage the public link.");
  });

  it("moves focus into the dialog on open", async () => {
    renderDialog();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderDialog();
    const u = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Open" });

    await u.click(trigger);
    await u.keyboard("{Escape}");

    expect(screen.queryByText("Share note")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes via DialogClose", async () => {
    renderDialog();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));
    await u.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByText("Share note")).not.toBeInTheDocument();
  });
});
