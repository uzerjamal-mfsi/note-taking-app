import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { getSharedNote } from "../api/sharing-api.js";
import { SharedNotePage } from "./SharedNotePage.js";

vi.mock("../api/sharing-api.js", () => ({ getSharedNote: vi.fn() }));
const getMock = vi.mocked(getSharedNote);

const text = (value: string, marks?: { type: string }[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

const richContent = {
  type: "doc",
  content: [
    { type: "paragraph", content: [text("My Title")] },
    { type: "heading", attrs: { level: 2 }, content: [text("Section")] },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [text("item one")] }] },
      ],
    },
    { type: "paragraph", content: [text("bold words", [{ type: "bold" }])] },
    { type: "blockquote", content: [{ type: "paragraph", content: [text("a quote")] }] },
    { type: "codeBlock", content: [text("const x = 1;")] },
  ],
};

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/shared/tok-1"]}>
        <Routes>
          <Route path="/shared/:token" element={<SharedNotePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SharedNotePage", () => {
  it("shows a loading indicator while the request is pending", () => {
    getMock.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("renders the title once and the body read-only with its formatting preserved", async () => {
    getMock.mockResolvedValue({ title: "My Title", content: richContent });

    const { container } = renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "My Title" })).toBeInTheDocument();
    expect(screen.getAllByText("My Title")).toHaveLength(1);
    expect(getMock).toHaveBeenCalledWith("tok-1");

    const prose = container.querySelector(".ProseMirror") as HTMLElement;
    expect(prose).toHaveAttribute("contenteditable", "false");
    expect(prose.querySelector("h2")).toHaveTextContent("Section");
    expect(prose.querySelector("ul li")).toHaveTextContent("item one");
    expect(prose.querySelector("strong")).toHaveTextContent("bold words");
    expect(prose.querySelector("blockquote")).toHaveTextContent("a quote");
    expect(prose.querySelector("pre code")).toHaveTextContent("const x = 1;");
  });

  it("offers no editing, tagging, or sharing controls", async () => {
    getMock.mockResolvedValue({ title: "My Title", content: richContent });

    const { container } = renderPage();
    await screen.findByRole("heading", { level: 1, name: "My Title" });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("input, textarea, select")).toBeNull();
    expect(container.querySelector("[contenteditable=true]")).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("document")).toHaveAttribute("contenteditable", "false");
  });

  it("shows the dedicated unavailable page on a 404, with no content and no retry", async () => {
    getMock.mockRejectedValue({ status: 404, code: "NOT_FOUND", message: "nope" });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "This link has expired or been revoked" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
    expect(screen.queryByText(/too many requests/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });

  it("shows a distinct rate-limited state on a 429", async () => {
    getMock.mockRejectedValue({ status: 429, code: "RATE_LIMITED", message: "slow down" });

    renderPage();

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(screen.queryByText(/expired or been revoked/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows a generic error with a working retry on other failures", async () => {
    getMock.mockRejectedValueOnce({ status: 500, code: "X", message: "boom" });
    getMock.mockResolvedValueOnce({ title: "My Title", content: richContent });
    const u = userEvent.setup();

    renderPage();
    await u.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "My Title" })).toBeInTheDocument(),
    );
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
