import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSearchResults } from "./notes-search-api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const paginatedResults = {
  data: [],
  meta: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => paginatedResults,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchSearchResults", () => {
  it("requests /notes/search with q/page/pageSize", async () => {
    const fetchMock = stubFetch();

    const result = await fetchSearchResults({ q: "grocery", page: 2, pageSize: 20 });

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain("/notes/search?");
    expect(requestedUrl).toContain("q=grocery");
    expect(requestedUrl).toContain("page=2");
    expect(requestedUrl).toContain("pageSize=20");
    expect(result).toEqual(paginatedResults);
  });

  it("URL-encodes special characters in q", async () => {
    const fetchMock = stubFetch();

    await fetchSearchResults({ q: "milk & eggs", page: 1, pageSize: 20 });

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as string;
    const params = new URL(requestedUrl).searchParams;
    expect(params.get("q")).toBe("milk & eggs");
  });
});
