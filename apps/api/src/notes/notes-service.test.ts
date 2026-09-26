import type { ListNotesQuery } from "@note-taking-app/shared";
import { describe, expect, it, vi } from "vitest";
import type { NoteRecord, NotesRepository } from "./notes-repository.js";
import { NotesService, deriveTitle } from "./notes-service.js";

describe("deriveTitle", () => {
  it("returns the first node's plain text", () => {
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Grocery list" }] }],
    };

    expect(deriveTitle(content)).toBe("Grocery list");
  });

  it("truncates to 120 characters", () => {
    const longText = "a".repeat(200);
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }],
    };

    expect(deriveTitle(content)).toHaveLength(120);
    expect(deriveTitle(content)).toBe("a".repeat(120));
  });

  it("concatenates text across nested marks/children within the first node", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };

    expect(deriveTitle(content)).toBe("Hello world");
  });

  it("falls back to Untitled when the first node has no text", () => {
    const content = { type: "doc", content: [{ type: "paragraph", content: [] }] };

    expect(deriveTitle(content)).toBe("Untitled");
  });

  it("falls back to Untitled when the first node's text is whitespace-only", () => {
    const content = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }],
    };

    expect(deriveTitle(content)).toBe("Untitled");
  });
});

function makeRepository(): NotesRepository {
  return {
    create: vi.fn(),
    findOwned: vi.fn(),
    list: vi.fn(),
    updateOwned: vi.fn(),
    softDeleteOwned: vi.fn(),
  } as unknown as NotesRepository;
}

const DEFAULT_QUERY: ListNotesQuery = {
  page: 1,
  pageSize: 20,
  sortBy: "updatedAt",
  sortDir: "desc",
  tags: undefined,
};

const CONTENT = { type: "doc", content: [{ type: "text", text: "Hello" }] };
const RECORD: NoteRecord = {
  id: "note-1",
  title: "Hello",
  content: CONTENT,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("NotesService", () => {
  it("createNote derives and stores title from content", async () => {
    const repository = makeRepository();
    vi.mocked(repository.create).mockResolvedValue(RECORD);
    const service = new NotesService(repository);

    await service.createNote("user-1", CONTENT);

    expect(repository.create).toHaveBeenCalledWith({
      userId: "user-1",
      title: "Hello",
      content: CONTENT,
    });
  });

  it("updateNote re-derives title on every update", async () => {
    const repository = makeRepository();
    const nextContent = { type: "doc", content: [{ type: "text", text: "Updated" }] };
    vi.mocked(repository.updateOwned).mockResolvedValue({ ...RECORD, title: "Updated" });
    const service = new NotesService(repository);

    await service.updateNote("note-1", "user-1", nextContent);

    expect(repository.updateOwned).toHaveBeenCalledWith("note-1", "user-1", {
      title: "Updated",
      content: nextContent,
    });
  });

  it("getNote throws NOTE_NOT_FOUND (404) when the repository returns no match", async () => {
    const repository = makeRepository();
    vi.mocked(repository.findOwned).mockResolvedValue(null);
    const service = new NotesService(repository);

    await expect(service.getNote("note-1", "user-1")).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
  });

  it("updateNote throws NOTE_NOT_FOUND (404) when the repository returns no match", async () => {
    const repository = makeRepository();
    vi.mocked(repository.updateOwned).mockResolvedValue(null);
    const service = new NotesService(repository);

    await expect(service.updateNote("note-1", "user-1", CONTENT)).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
  });

  it("deleteNote throws NOTE_NOT_FOUND (404) when the repository reports no match", async () => {
    const repository = makeRepository();
    vi.mocked(repository.softDeleteOwned).mockResolvedValue(false);
    const service = new NotesService(repository);

    await expect(service.deleteNote("note-1", "user-1")).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
  });

  describe("listNotes", () => {
    it("passes the resolved query through to the repository unchanged", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [RECORD], total: 1 });
      const service = new NotesService(repository);
      const query: ListNotesQuery = { ...DEFAULT_QUERY, page: 2, tags: ["work"] };

      await service.listNotes("user-1", query);

      expect(repository.list).toHaveBeenCalledWith("user-1", query);
    });

    it("computes meta for a first page with more pages remaining", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [RECORD], total: 25 });
      const service = new NotesService(repository);

      const result = await service.listNotes("user-1", { ...DEFAULT_QUERY, page: 1, pageSize: 20 });

      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });

    it("computes meta for the last page", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [RECORD], total: 25 });
      const service = new NotesService(repository);

      const result = await service.listNotes("user-1", { ...DEFAULT_QUERY, page: 2, pageSize: 20 });

      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    it("computes meta for a page past the end", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [], total: 5 });
      const service = new NotesService(repository);

      const result = await service.listNotes("user-1", { ...DEFAULT_QUERY, page: 3, pageSize: 20 });

      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    it("computes totalPages as 0 when there are no matching notes", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [], total: 0 });
      const service = new NotesService(repository);

      const result = await service.listNotes("user-1", DEFAULT_QUERY);

      expect(result.totalPages).toBe(0);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });
  });
});
