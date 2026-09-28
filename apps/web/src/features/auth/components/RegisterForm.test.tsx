import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { useSessionStore } from "../../../store/session-store.js";
import { RegisterForm } from "./RegisterForm.js";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function renderRegisterForm(initialEntries: Array<string | { pathname: string; state?: unknown }>) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/register" element={<RegisterForm />} />
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
  await u.type(screen.getByLabelText(/name/i), "Ada Lovelace");
  await u.type(screen.getByLabelText(/email/i), "ada@example.com");
  await u.type(screen.getByLabelText(/password/i), "supersecret");
  await u.click(screen.getByRole("button", { name: /create account/i }));
}

describe("RegisterForm", () => {
  it("starts a session and navigates to the default route on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(201, { user, accessToken: "tok" })),
    );
    renderRegisterForm(["/register"]);

    await fillValidForm();

    await waitFor(() =>
      expect(screen.getByText("default authenticated route")).toBeInTheDocument(),
    );
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("navigates back to the originally-requested route when one was preserved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(201, { user, accessToken: "tok" })),
    );
    renderRegisterForm([{ pathname: "/register", state: { from: { pathname: "/notes/123" } } }]);

    await fillValidForm();

    await waitFor(() =>
      expect(screen.getByText("the originally-requested route")).toBeInTheDocument(),
    );
  });

  it("shows the server's error message inline without navigating on a duplicate email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "Email already registered",
        }),
      ),
    );
    renderRegisterForm(["/register"]);

    await fillValidForm();

    await waitFor(() => expect(screen.getByText("Email already registered")).toBeInTheDocument());
    expect(screen.queryByText("default authenticated route")).not.toBeInTheDocument();
    expect(useSessionStore.getState().status).toBe("idle");
  });

  it("blocks submission when the password is shorter than 8 characters", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderRegisterForm(["/register"]);

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/name/i), "Ada Lovelace");
    await u.type(screen.getByLabelText(/email/i), "ada@example.com");
    await u.type(screen.getByLabelText(/password/i), "short");
    await u.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
