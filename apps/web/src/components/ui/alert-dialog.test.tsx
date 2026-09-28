import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog.js";

function renderDialog() {
  return render(
    <AlertDialog>
      <AlertDialogTrigger>Open</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );
}

describe("AlertDialog", () => {
  it("is closed until the trigger is activated", () => {
    renderDialog();

    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
  });

  it("opens on trigger activation and closes on cancel", async () => {
    renderDialog();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
  });

  it("closes after the action is confirmed", async () => {
    renderDialog();
    const u = userEvent.setup();

    await u.click(screen.getByRole("button", { name: "Open" }));
    await u.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();
  });
});
