import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNotes } from "./notes-api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const paginatedNotes = {
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
    json: async () => paginatedNotes,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchNotes", () => {
  it("requests /notes with page/sortBy/sortDir and no tags param when tags is empty", async () => {
    const fetchMock = stubFetch();

    const result = await fetchNotes({ page: 2, sortBy: "createdAt", sortDir: "asc", tags: [] });

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain("/notes?");
    expect(requestedUrl).toContain("page=2");
    expect(requestedUrl).toContain("sortBy=createdAt");
    expect(requestedUrl).toContain("sortDir=asc");
    expect(requestedUrl).not.toContain("tags=");
    expect(result).toEqual(paginatedNotes);
  });

  it("includes a comma-joined tags param when tags is non-empty", async () => {
    const fetchMock = stubFetch();

    await fetchNotes({ page: 1, sortBy: "updatedAt", sortDir: "desc", tags: ["work", "personal"] });

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain(`tags=${encodeURIComponent("work,personal")}`);
  });
});
