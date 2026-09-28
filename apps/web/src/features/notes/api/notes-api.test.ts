import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteDto } from "@note-taking-app/shared";
import { createNote, deleteNote, fetchNotes, getNote, updateNote } from "./notes-api.js";

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

function makeNote(overrides: Partial<NoteDto> = {}): NoteDto {
  return {
    id: "note-1",
    title: "Grocery list",
    content: { type: "doc", content: [{ type: "paragraph", content: [] }] },
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    tags: [],
    ...overrides,
  };
}

describe("getNote", () => {
  it("requests GET /notes/:id and returns the parsed note", async () => {
    const note = makeNote();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => note });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getNote("note-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/note-1");
    expect(init.method ?? "GET").toBe("GET");
    expect(result).toEqual(note);
  });
});

describe("createNote", () => {
  it("POSTs /notes with the given content and returns the created note", async () => {
    const note = makeNote();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => note });
    vi.stubGlobal("fetch", fetchMock);
    const content = { type: "doc", content: [{ type: "paragraph", content: [] }] };

    const result = await createNote(content);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ content });
    expect(result).toEqual(note);
  });
});

describe("updateNote", () => {
  it("PATCHes /notes/:id with content only when tagIds is omitted", async () => {
    const note = makeNote();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => note });
    vi.stubGlobal("fetch", fetchMock);
    const content = { type: "doc", content: [{ type: "paragraph", content: [] }] };

    const result = await updateNote("note-1", { content });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/note-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ content });
    expect(result).toEqual(note);
  });

  it("PATCHes /notes/:id with content and tagIds when tagIds is given", async () => {
    const note = makeNote();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => note });
    vi.stubGlobal("fetch", fetchMock);
    const content = { type: "doc", content: [{ type: "paragraph", content: [] }] };

    await updateNote("note-1", { content, tagIds: ["tag-1", "tag-2"] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ content, tagIds: ["tag-1", "tag-2"] });
  });
});

describe("deleteNote", () => {
  it("DELETEs /notes/:id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 204, json: async () => undefined });
    vi.stubGlobal("fetch", fetchMock);

    await deleteNote("note-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/notes/note-1");
    expect(init.method).toBe("DELETE");
  });
});
