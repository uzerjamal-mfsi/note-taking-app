import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "./lib/query-client.js";
import { App } from "./App.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows a loading indicator while the health query is pending", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(
      <QueryClientProvider client={createQueryClient()}>
        <App />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();

    resolveFetch({ ok: true, json: async () => ({ status: "ok" }) });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });
});
