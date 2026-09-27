import { describe, expect, it, vi } from "vitest";
import type { NotesSearchRepository, SearchResultRow } from "./notes-search-repository.js";
import { NotesSearchService } from "./notes-search-service.js";
import { START_SENTINEL, STOP_SENTINEL } from "./sentinel-highlight.js";

function makeRepository(): NotesSearchRepository {
  return { search: vi.fn() } as unknown as NotesSearchRepository;
}

const BASE_ROW: SearchResultRow = {
  id: "note-1",
  titleHighlighted: "Grocery list",
  snippetHighlighted: "Buy eggs and milk",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  tags: [{ id: "tag-1", name: "work", color: "#FF8800" }],
};

describe("NotesSearchService", () => {
  it("passes the query through to the repository unchanged", async () => {
    const repository = makeRepository();
    vi.mocked(repository.search).mockResolvedValue({ results: [], total: 0 });
    const service = new NotesSearchService(repository);

    await service.search("user-1", { q: "grocery", page: 1, pageSize: 20 });

    expect(repository.search).toHaveBeenCalledWith("user-1", {
      q: "grocery",
      page: 1,
      pageSize: 20,
    });
  });

  it("parses a title match into structured ranges and leaves snippet ranges empty", async () => {
    const repository = makeRepository();
    vi.mocked(repository.search).mockResolvedValue({
      results: [{ ...BASE_ROW, titleHighlighted: `${START_SENTINEL}Grocery${STOP_SENTINEL} list` }],
      total: 1,
    });
    const service = new NotesSearchService(repository);

    const result = await service.search("user-1", { q: "grocery", page: 1, pageSize: 20 });

    expect(result.results[0]).toMatchObject({
      title: "Grocery list",
      titleMatches: [{ start: 0, end: 7 }],
      snippet: "Buy eggs and milk",
      snippetMatches: [],
    });
  });

  it("parses a body match into structured ranges and leaves title ranges empty", async () => {
    const repository = makeRepository();
    vi.mocked(repository.search).mockResolvedValue({
      results: [
        { ...BASE_ROW, snippetHighlighted: `Buy ${START_SENTINEL}eggs${STOP_SENTINEL} and milk` },
      ],
      total: 1,
    });
    const service = new NotesSearchService(repository);

    const result = await service.search("user-1", { q: "eggs", page: 1, pageSize: 20 });

    expect(result.results[0]).toMatchObject({
      title: "Grocery list",
      titleMatches: [],
      snippet: "Buy eggs and milk",
      snippetMatches: [{ start: 4, end: 8 }],
    });
  });

  it("passes tags and dates through unchanged", async () => {
    const repository = makeRepository();
    vi.mocked(repository.search).mockResolvedValue({ results: [BASE_ROW], total: 1 });
    const service = new NotesSearchService(repository);

    const result = await service.search("user-1", { q: "grocery", page: 1, pageSize: 20 });

    expect(result.results[0]?.tags).toEqual(BASE_ROW.tags);
    expect(result.results[0]?.createdAt).toEqual(BASE_ROW.createdAt);
    expect(result.results[0]?.updatedAt).toEqual(BASE_ROW.updatedAt);
  });

  it("computes meta for a first page with more pages remaining", async () => {
    const repository = makeRepository();
    vi.mocked(repository.search).mockResolvedValue({ results: [BASE_ROW], total: 25 });
    const service = new NotesSearchService(repository);

    const result = await service.search("user-1", { q: "note", page: 1, pageSize: 20 });

    expect(result.totalPages).toBe(2);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(false);
  });

  it("computes meta for the last page", async () => {
    const repository = makeRepository();
    vi.mocked(repository.search).mockResolvedValue({ results: [BASE_ROW], total: 25 });
    const service = new NotesSearchService(repository);

    const result = await service.search("user-1", { q: "note", page: 2, pageSize: 20 });

    expect(result.totalPages).toBe(2);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(true);
  });

  it("computes totalPages as 0 when there are no matches", async () => {
    const repository = makeRepository();
    vi.mocked(repository.search).mockResolvedValue({ results: [], total: 0 });
    const service = new NotesSearchService(repository);

    const result = await service.search("user-1", { q: "note", page: 1, pageSize: 20 });

    expect(result.totalPages).toBe(0);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(false);
  });
});
