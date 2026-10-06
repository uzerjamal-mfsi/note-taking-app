import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SearchBox } from "./SearchBox.js";

const DEBOUNCE_MS = 300;

async function flushTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchBox", () => {
  it("commits once, after the debounce period, following a burst of keystrokes", async () => {
    const onCommit = vi.fn();
    render(<SearchBox value="" onCommit={onCommit} debounceMs={DEBOUNCE_MS} />);
    const input = screen.getByLabelText("Search notes");

    fireEvent.change(input, { target: { value: "g" } });
    fireEvent.change(input, { target: { value: "gr" } });
    fireEvent.change(input, { target: { value: "grocery" } });

    expect(onCommit).not.toHaveBeenCalled();

    await flushTimers(DEBOUNCE_MS);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("grocery");
  });

  it("does not commit before the debounce period elapses", async () => {
    const onCommit = vi.fn();
    render(<SearchBox value="" onCommit={onCommit} debounceMs={DEBOUNCE_MS} />);
    const input = screen.getByLabelText("Search notes");

    fireEvent.change(input, { target: { value: "grocery" } });
    await flushTimers(DEBOUNCE_MS - 1);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("updates the displayed value when the external value prop changes", () => {
    const { rerender } = render(<SearchBox value="" onCommit={vi.fn()} />);
    const input = screen.getByLabelText("Search notes") as HTMLInputElement;
    expect(input.value).toBe("");

    rerender(<SearchBox value="grocery" onCommit={vi.fn()} />);

    expect(input.value).toBe("grocery");
  });

  it("the clear button commits an empty string immediately, without waiting for the debounce", () => {
    const onCommit = vi.fn();
    render(<SearchBox value="grocery" onCommit={onCommit} debounceMs={DEBOUNCE_MS} />);

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("pressing Escape clears the input and commits an empty string immediately", () => {
    const onCommit = vi.fn();
    render(<SearchBox value="grocery" onCommit={onCommit} debounceMs={DEBOUNCE_MS} />);
    const input = screen.getByLabelText("Search notes") as HTMLInputElement;

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("");
    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("submitting the form does not cause a page navigation", () => {
    const onCommit = vi.fn();
    render(<SearchBox value="grocery" onCommit={onCommit} debounceMs={DEBOUNCE_MS} />);
    const form = screen.getByRole("search");
    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });

    form.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
  });

  it("does not commit a pending debounced value after unmount", async () => {
    const onCommit = vi.fn();
    const { unmount } = render(<SearchBox value="" onCommit={onCommit} debounceMs={DEBOUNCE_MS} />);
    const input = screen.getByLabelText("Search notes");

    fireEvent.change(input, { target: { value: "grocery" } });
    unmount();

    await flushTimers(DEBOUNCE_MS);

    expect(onCommit).not.toHaveBeenCalled();
  });
});
