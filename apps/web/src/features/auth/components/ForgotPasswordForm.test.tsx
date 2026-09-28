import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { createQueryClient } from "../../../lib/query-client.js";
import { ForgotPasswordForm } from "./ForgotPasswordForm.js";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function ResetPasswordStub() {
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;
  return <p>reset password page{email ? ` for ${email}` : ""}</p>;
}

function renderForgotPasswordForm() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordForm />} />
          <Route path="/reset-password" element={<ResetPasswordStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ForgotPasswordForm", () => {
  it("shows the same neutral confirmation for any syntactically valid email and offers a link to reset-password carrying the email", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { message: "If that email is registered, a code has been sent" }),
        ),
    );
    renderForgotPasswordForm();

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/email/i), "ada@example.com");
    await u.click(screen.getByRole("button", { name: /send reset code/i }));

    await waitFor(() =>
      expect(screen.getByText(/if that email is registered/i)).toBeInTheDocument(),
    );

    await u.click(screen.getByRole("link", { name: /enter code/i }));
    expect(screen.getByText("reset password page for ada@example.com")).toBeInTheDocument();
  });

  it("blocks submission for a malformed email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderForgotPasswordForm();

    const u = userEvent.setup();
    await u.type(screen.getByLabelText(/email/i), "not-an-email");
    await u.click(screen.getByRole("button", { name: /send reset code/i }));

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
