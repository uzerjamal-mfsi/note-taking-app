import { describe, expect, it } from "vitest";
import { createQueryClient } from "./query-client.js";

describe("createQueryClient", () => {
  it("is constructed with the intended defaults", () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.staleTime).toBeGreaterThan(0);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(true);
  });
});
