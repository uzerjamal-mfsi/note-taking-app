import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ShareLinkDto } from "@note-taking-app/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createShareLink, getShareLink, revokeShareLink } from "../api/sharing-api.js";
import { ShareDialog } from "./ShareDialog.js";

vi.mock("../api/sharing-api.js", () => ({
  getShareLink: vi.fn(),
  createShareLink: vi.fn(),
  revokeShareLink: vi.fn(),
}));

const getMock = vi.mocked(getShareLink);
const createMock = vi.mocked(createShareLink);
const revokeMock = vi.mocked(revokeShareLink);

const activeLink: ShareLinkDto = {
  token: "tok-123",
  viewCount: 7,
  expiresAt: null,
  createdAt: "2026-10-06T00:00:00.000Z",
};
const shareUrl = `${window.location.origin}/shared/tok-123`;

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <ShareDialog noteId="note-1" />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

async function openDialog(u: ReturnType<typeof userEvent.setup>) {
  await u.click(screen.getByRole("button", { name: "Share" }));
}

/** Fake server: after a successful create, GET returns the new link. */
function mockCreateSucceeds(link: ShareLinkDto) {
  createMock.mockImplementation(async () => {
    getMock.mockResolvedValue(link);
    return link;
  });
}

/** Fake server: after revoke (or a 404 because it is already gone), GET returns no link. */
function mockRevokeSucceeds(error?: { status: number; code: string; message: string }) {
  revokeMock.mockImplementation(async () => {
    getMock.mockResolvedValue(null);
    if (error) {
      throw error;
    }
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ShareDialog - loading states", () => {
  it("does not request the link until opened", () => {
    getMock.mockResolvedValue(null);
    renderDialog();

    expect(getMock).not.toHaveBeenCalled();
  });

  it("shows a loading indicator while the link loads", async () => {
    getMock.mockReturnValue(new Promise(() => undefined));
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);

    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("Loading");
  });

  it("shows the not-shared state without an error on a 404 (null)", async () => {
    getMock.mockResolvedValue(null);
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);

    expect(await screen.findByRole("button", { name: "Create link" })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });

  it("shows an error with a working retry on failure", async () => {
    getMock.mockRejectedValueOnce({ status: 500, code: "X", message: "boom" });
    getMock.mockResolvedValueOnce(activeLink);
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByDisplayValue(shareUrl)).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});

describe("ShareDialog - create flow", () => {
  beforeEach(() => {
    getMock.mockResolvedValue(null);
  });

  it("creates a link without expiry, sending no expiresAt", async () => {
    mockCreateSucceeds(activeLink);
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Create link" }));

    expect(createMock).toHaveBeenCalledWith("note-1", undefined);
    expect(await screen.findByDisplayValue(shareUrl)).toBeInTheDocument();
    expect(screen.getByText("Never expires")).toBeInTheDocument();
  });

  it("sends the entered local moment as an ISO 8601 UTC timestamp", async () => {
    const expiresAt = new Date("2099-01-01T10:00").toISOString();
    mockCreateSucceeds({ ...activeLink, expiresAt });
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    fireEvent.change(await screen.findByLabelText("Expires (optional)"), {
      target: { value: "2099-01-01T10:00" },
    });
    await u.click(screen.getByRole("button", { name: "Create link" }));

    expect(createMock).toHaveBeenCalledWith("note-1", expiresAt);
    expect(expiresAt.endsWith("Z")).toBe(true);
    // Independent of the implementation: local 10:00 on that date, shifted by the zone's offset, is the UTC instant.
    const localTenAm = new Date(2099, 0, 1, 10, 0);
    expect(Date.parse(expiresAt)).toBe(
      Date.UTC(2099, 0, 1, 10, 0) + localTenAm.getTimezoneOffset() * 60_000,
    );
    expect(await screen.findByDisplayValue(shareUrl)).toBeInTheDocument();
  });

  it("sets the input's min to the current local date-time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2030, 0, 2, 3, 4));
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();

    await openDialog(u);

    expect(await screen.findByLabelText("Expires (optional)")).toHaveAttribute(
      "min",
      "2030-01-02T03:04",
    );
  });

  it("blocks a past expiry typed past the min and sends nothing", async () => {
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    fireEvent.change(await screen.findByLabelText("Expires (optional)"), {
      target: { value: "2020-01-01T10:00" },
    });
    await u.click(screen.getByRole("button", { name: "Create link" }));

    expect(createMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/in the future/i);
  });

  it("shows an inline expiry error on a server 422 and stays in the not-shared state", async () => {
    createMock.mockRejectedValue({ status: 422, code: "VALIDATION_ERROR", message: "bad" });
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    fireEvent.change(await screen.findByLabelText("Expires (optional)"), {
      target: { value: "2099-01-01T10:00" },
    });
    await u.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't allowed/i);
    expect(screen.getByRole("button", { name: "Create link" })).toBeInTheDocument();
  });

  it("shows the existing link when the server returns one", async () => {
    mockCreateSucceeds({ ...activeLink, viewCount: 42 });
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Create link" }));

    expect(await screen.findByText("42")).toBeInTheDocument();
  });

  it("shows an error message when creation fails with 404", async () => {
    createMock.mockRejectedValue({ status: 404, code: "NOT_FOUND", message: "gone" });
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Create link" }));

    expect(await screen.findByText(/couldn't create a link/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(shareUrl)).not.toBeInTheDocument();
  });
});

describe("ShareDialog - active link", () => {
  beforeEach(() => {
    getMock.mockResolvedValue(activeLink);
  });

  it("shows the web-origin URL, view count, and Never expires", async () => {
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);

    const field = await screen.findByLabelText("Public link");
    expect(field).toHaveValue(shareUrl);
    expect(field).toHaveAttribute("readonly");
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Never expires")).toBeInTheDocument();
  });

  it("shows a localized expiry when the link expires", async () => {
    const expiresAt = "2099-01-02T03:04:05.000Z";
    getMock.mockResolvedValue({ ...activeLink, expiresAt });
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);

    expect(await screen.findByText(new Date(expiresAt).toLocaleString())).toBeInTheDocument();
  });

  it("copies the URL and shows a Copied confirmation", async () => {
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(shareUrl);
  });

  it("shows a manual-copy message when the clipboard write fails", async () => {
    const u = userEvent.setup();
    renderDialog();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Copy link" }));

    expect(await screen.findByText(/copy it manually/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Public link")).toBeInTheDocument();
  });
});

describe("ShareDialog - revoke flow", () => {
  beforeEach(() => {
    getMock.mockResolvedValue(activeLink);
  });

  async function openRevokeConfirmation(u: ReturnType<typeof userEvent.setup>) {
    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Revoke link" }));
  }

  it("sends DELETE only after confirmation and shows the not-shared state", async () => {
    mockRevokeSucceeds();
    const u = userEvent.setup();
    renderDialog();

    await openRevokeConfirmation(u);
    expect(revokeMock).not.toHaveBeenCalled();
    await u.click(screen.getByRole("button", { name: "Revoke" }));

    expect(revokeMock).toHaveBeenCalledWith("note-1");
    expect(await screen.findByRole("button", { name: "Create link" })).toBeInTheDocument();
  });

  it("sends nothing when canceled", async () => {
    const u = userEvent.setup();
    renderDialog();

    await openRevokeConfirmation(u);
    await u.click(screen.getByRole("button", { name: "Cancel" }));

    expect(revokeMock).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(shareUrl)).toBeInTheDocument();
  });

  it("Escape closes only the confirmation and returns focus to Revoke link", async () => {
    const u = userEvent.setup();
    renderDialog();

    await openRevokeConfirmation(u);
    await u.keyboard("{Escape}");

    expect(screen.queryByText("Revoke this link?")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Share this note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke link" })).toHaveFocus();
  });

  it("treats a 404 as already revoked", async () => {
    mockRevokeSucceeds({ status: 404, code: "NOT_FOUND", message: "gone" });
    const u = userEvent.setup();
    renderDialog();

    await openRevokeConfirmation(u);
    await u.click(screen.getByRole("button", { name: "Revoke" }));

    expect(await screen.findByRole("button", { name: "Create link" })).toBeInTheDocument();
  });

  it("shows an error and keeps the link on another failure", async () => {
    revokeMock.mockRejectedValue({ status: 500, code: "X", message: "boom" });
    const u = userEvent.setup();
    renderDialog();

    await openRevokeConfirmation(u);
    await u.click(screen.getByRole("button", { name: "Revoke" }));

    expect(await screen.findByText(/couldn't revoke/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(shareUrl)).toBeInTheDocument();
  });
});

describe("ShareDialog - focus", () => {
  it("moves focus into the modal on open and back to the Share button on close", async () => {
    getMock.mockResolvedValue(null);
    const u = userEvent.setup();
    renderDialog();
    const trigger = screen.getByRole("button", { name: "Share" });

    await u.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Share this note" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe("ShareDialog - consistency", () => {
  it("reflects a created link after close and reopen", async () => {
    getMock.mockResolvedValueOnce(null).mockResolvedValue(activeLink);
    mockCreateSucceeds(activeLink);
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Create link" }));
    await screen.findByDisplayValue(shareUrl);
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openDialog(u);

    expect(await screen.findByDisplayValue(shareUrl)).toBeInTheDocument();
  });

  it("reflects a revoked link after close and reopen", async () => {
    getMock.mockResolvedValueOnce(activeLink).mockResolvedValue(null);
    revokeMock.mockResolvedValue(undefined);
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);
    await u.click(await screen.findByRole("button", { name: "Revoke link" }));
    await u.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByRole("button", { name: "Create link" });
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openDialog(u);

    expect(await screen.findByRole("button", { name: "Create link" })).toBeInTheDocument();
  });

  it("shows no link details when loading fails with 401", async () => {
    getMock.mockRejectedValue({ status: 401, code: "UNAUTHORIZED", message: "no" });
    const u = userEvent.setup();
    renderDialog();

    await openDialog(u);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Public link")).not.toBeInTheDocument();
  });
});
