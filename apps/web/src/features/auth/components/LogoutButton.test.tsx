import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { useSessionStore } from "../../../store/session-store.js";
import { LogoutButton } from "./LogoutButton.js";

const user = { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" };

function renderLogoutButton() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<LogoutButton />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSessionStore.setState({ status: "authenticated", user, accessToken: "tok" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LogoutButton", () => {
  it("calls logout, clears the session, and navigates to /login on success", async () => {
    vi.stubGlobal(
      "fetch",
      // The real /auth/logout endpoint responds 204 No Content with no body.
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error("no body to parse on a 204 response")),
      }),
    );

    const u = userEvent.setup();
    renderLogoutButton();
    await u.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });

  it("still clears the session and navigates to /login when the logout request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const u = userEvent.setup();
    renderLogoutButton();
    await u.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });
});
