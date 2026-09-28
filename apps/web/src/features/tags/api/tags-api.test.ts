import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTags } from "./tags-api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTags", () => {
  it("requests /tags and returns the parsed tag list", async () => {
    const tags = [
      {
        id: "tag-1",
        name: "work",
        color: "#FF0000",
        createdAt: "2026-01-01T00:00:00.000Z",
        noteCount: 3,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => tags,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTags();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/tags"), expect.anything());
    expect(result).toEqual(tags);
  });
});
