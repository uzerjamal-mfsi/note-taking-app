import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { useSessionStore } from "../../../store/session-store.js";
import { ResetPasswordForm } from "./ResetPasswordForm.js";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderResetPasswordForm(
  initialEntries: Array<string | { pathname: string; state?: unknown }>,
) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordForm />} />
          <Route path="/login" element={<p>login page</p>} />
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

describe("ResetPasswordForm", () => {
  it("shows a confirmation and navigates to /login without starting a session on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { message: "Password updated" })),
    );
    renderResetPasswordForm(["/reset-password"]);

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/email/i), "ada@example.com");
    await u.type(screen.getByLabelText(/code/i), "123456");
    await u.type(screen.getByLabelText(/new password/i), "supersecret");
    await u.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
    expect(useSessionStore.getState().status).toBe("idle");
  });

  it("shows the same generic error for any 401 cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          code: "INVALID_RESET_ATTEMPT",
          message: "server-specific detail that must not leak",
        }),
      ),
    );
    renderResetPasswordForm(["/reset-password"]);

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/email/i), "ada@example.com");
    await u.type(screen.getByLabelText(/code/i), "000000");
    await u.type(screen.getByLabelText(/new password/i), "supersecret");
    await u.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired code/i)).toBeInTheDocument());
    expect(screen.queryByText(/server-specific detail/i)).not.toBeInTheDocument();
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
  });

  it("blocks submission for a short new password or empty code", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderResetPasswordForm(["/reset-password"]);

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/email/i), "ada@example.com");
    await u.type(screen.getByLabelText(/new password/i), "short");
    await u.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("pre-fills the email field from navigation state, remaining editable, and stays empty without it", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderResetPasswordForm([{ pathname: "/reset-password", state: { email: "ada@example.com" } }]);

    expect(screen.getByLabelText(/email/i)).toHaveValue("ada@example.com");
  });

  it("leaves the email field empty when reached directly with no navigation state", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderResetPasswordForm(["/reset-password"]);

    expect(screen.getByLabelText(/email/i)).toHaveValue("");
  });
});
