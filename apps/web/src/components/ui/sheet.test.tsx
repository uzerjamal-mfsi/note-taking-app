import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet.js";

function renderSheet() {
  return render(
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Browse earlier versions.</SheetDescription>
        </SheetHeader>
        <input aria-label="Field" />
        <SheetClose>Close</SheetClose>
      </SheetContent>
    </Sheet>,
  );
}

describe("Sheet", () => {
  it("is closed until the trigger is activated", () => {
    renderSheet();

    expect(screen.queryByText("Version history")).not.toBeInTheDocument();
  });

  it("opens on trigger activation and exposes title and description via ARIA", async () => {
    renderSheet();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Version history" });
    expect(dialog).toHaveAccessibleDescription("Browse earlier versions.");
  });

  it("moves focus into the sheet on open", async () => {
    renderSheet();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    renderSheet();
    const u = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Open" });

    await u.click(trigger);
    await u.keyboard("{Escape}");

    expect(screen.queryByText("Version history")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes via SheetClose", async () => {
    renderSheet();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));
    await u.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByText("Version history")).not.toBeInTheDocument();
  });
});
