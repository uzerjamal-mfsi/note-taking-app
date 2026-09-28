import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useSessionStore } from "../store/session-store.js";
import { AppProviders } from "./AppProviders.js";

const user = { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" };

beforeEach(() => {
  useSessionStore.setState({ status: "idle", user: null, accessToken: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("AppProviders session bootstrap", () => {
  it("shows a loading indicator while bootstrapping, then recovers the session and renders children", async () => {
    const { promise, resolve } = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(promise));

    render(
      <AppProviders>
        <div>authenticated content</div>
      </AppProviders>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("authenticated content")).not.toBeInTheDocument();

    resolve({
      ok: true,
      json: async () => ({ user, accessToken: "fresh-token" }),
    } as Response);

    await waitFor(() => expect(screen.getByText("authenticated content")).toBeInTheDocument());
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("shows a loading indicator while bootstrapping, then renders children with no session when refresh fails", async () => {
    const { promise, resolve } = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(promise));

    render(
      <AppProviders>
        <div>public content</div>
      </AppProviders>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();

    resolve({
      ok: false,
      status: 401,
      json: async () => ({ code: "INVALID_TOKEN", message: "invalid" }),
    } as Response);

    await waitFor(() => expect(screen.getByText("public content")).toBeInTheDocument());
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });
});
