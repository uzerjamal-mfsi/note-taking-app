import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { useSessionStore } from "../../../store/session-store.js";
import { LoginForm } from "./LoginForm.js";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderLoginForm(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/" element={<p>default authenticated route</p>} />
          <Route path="/notes/:id" element={<p>the originally-requested route</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSessionStore.setState({ status: "idle", user: null, accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const user = { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" };

async function fillValidForm() {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText(/email/i), "ada@example.com");
  await u.type(screen.getByLabelText(/password/i), "supersecret");
  await u.click(screen.getByRole("button", { name: /log in/i }));
}

describe("LoginForm", () => {
  it("starts a session and navigates to the default route on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { user, accessToken: "tok" })),
    );
    renderLoginForm(["/login"]);

    await fillValidForm();

    await waitFor(() =>
      expect(screen.getByText("default authenticated route")).toBeInTheDocument(),
    );
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("navigates back to the originally-requested route when one was preserved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { user, accessToken: "tok" })),
    );
    renderLoginForm([{ pathname: "/login", state: { from: { pathname: "/notes/123" } } }]);

    await fillValidForm();

    await waitFor(() =>
      expect(screen.getByText("the originally-requested route")).toBeInTheDocument(),
    );
  });

  it("shows the same generic message for an unknown email and a wrong password", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }),
        ),
    );
    renderLoginForm(["/login"]);

    await fillValidForm();

    await waitFor(() => expect(screen.getByText("Invalid email or password")).toBeInTheDocument());
    expect(useSessionStore.getState().status).toBe("idle");
  });

  it("blocks submission when a required field is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderLoginForm(["/login"]);

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/email/i), "ada@example.com");
    await u.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
