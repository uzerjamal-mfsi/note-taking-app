import { Prisma, type PrismaClient } from "@note-taking-app/db";
import type { ListNotesQuery } from "@note-taking-app/shared";
import { describe, expect, it, vi } from "vitest";
import type { NoteRecord, NotesRepository } from "./notes-repository.js";
import { NotesService, deriveTitle, extractSearchText } from "./notes-service.js";

function foreignKeyConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
    code: "P2003",
    clientVersion: "5.22.0",
  });
}

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

describe("extractSearchText", () => {
  it("collects text across every top-level node, not just the first", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First paragraph" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second paragraph" }] },
      ],
    };

    expect(extractSearchText(content)).toBe("First paragraph Second paragraph");
  });

  it("includes text under marks (bold/italic) the same as plain text", () => {
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

    expect(extractSearchText(content)).toBe("Hello world");
  });

  it("contributes nothing for a hard break (no text, no nested content)", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line one" },
            { type: "hardBreak" },
            { type: "text", text: "Line two" },
          ],
        },
      ],
    };

    expect(extractSearchText(content)).toBe("Line oneLine two");
  });

  it("recurses into nested lists", () => {
    const content = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "First item" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second item" }] }],
            },
          ],
        },
      ],
    };

    expect(extractSearchText(content)).toBe("First itemSecond item");
  });

  it("skips an empty paragraph (no text) rather than inserting a blank entry", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "paragraph", content: [] },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    };

    expect(extractSearchText(content)).toBe("Before After");
  });

  it("returns an empty string when the document has no top-level content", () => {
    expect(extractSearchText({ type: "doc", content: [] })).toBe("");
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

/**
 * A minimal `PrismaClient` stub whose `tag.findMany` resolves to the given
 * ids, and whose `$transaction` runs its callback against a `tx` stub -
 * `sharedNote.deleteMany` is a no-op spy by default. `deleteNote` passes this
 * same `tx` through to `repository.softDeleteOwned`, so it carries no
 * `note` model of its own.
 */
function makePrisma(
  ownedTagIds: string[] = [],
  tx: {
    sharedNote: { deleteMany: ReturnType<typeof vi.fn> };
  } = {
    sharedNote: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
): PrismaClient {
  return {
    tag: {
      findMany: vi.fn().mockResolvedValue(ownedTagIds.map((id) => ({ id }))),
    },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaClient;
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
  tags: [],
};

describe("NotesService", () => {
  it("createNote derives and stores title from content", async () => {
    const repository = makeRepository();
    vi.mocked(repository.create).mockResolvedValue(RECORD);
    const service = new NotesService(repository, makePrisma());

    await service.createNote("user-1", CONTENT);

    expect(repository.create).toHaveBeenCalledWith({
      userId: "user-1",
      title: "Hello",
      content: CONTENT,
      searchText: "Hello",
      tagIds: undefined,
    });
  });

  it("updateNote re-derives title on every update", async () => {
    const repository = makeRepository();
    const nextContent = { type: "doc", content: [{ type: "text", text: "Updated" }] };
    vi.mocked(repository.updateOwned).mockResolvedValue({ ...RECORD, title: "Updated" });
    const service = new NotesService(repository, makePrisma());

    await service.updateNote("note-1", "user-1", nextContent);

    expect(repository.updateOwned).toHaveBeenCalledWith("note-1", "user-1", {
      title: "Updated",
      content: nextContent,
      searchText: "Updated",
      tagIds: undefined,
    });
  });

  it("getNote throws NOTE_NOT_FOUND (404) when the repository returns no match", async () => {
    const repository = makeRepository();
    vi.mocked(repository.findOwned).mockResolvedValue(null);
    const service = new NotesService(repository, makePrisma());

    await expect(service.getNote("note-1", "user-1")).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
  });

  it("updateNote throws NOTE_NOT_FOUND (404) when the repository returns no match", async () => {
    const repository = makeRepository();
    vi.mocked(repository.updateOwned).mockResolvedValue(null);
    const service = new NotesService(repository, makePrisma());

    await expect(service.updateNote("note-1", "user-1", CONTENT)).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
  });

  it("deleteNote throws NOTE_NOT_FOUND (404) when the soft-delete matches nothing", async () => {
    const repository = makeRepository();
    vi.mocked(repository.softDeleteOwned).mockResolvedValue(false);
    const tx = { sharedNote: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    const service = new NotesService(repository, makePrisma([], tx));

    await expect(service.deleteNote("note-1", "user-1")).rejects.toMatchObject({
      code: "NOTE_NOT_FOUND",
      status: 404,
    });
    expect(repository.softDeleteOwned).toHaveBeenCalledWith("note-1", "user-1", tx);
    expect(tx.sharedNote.deleteMany).not.toHaveBeenCalled();
  });

  it("deleteNote also deletes the note's share link, in the same transaction", async () => {
    const repository = makeRepository();
    vi.mocked(repository.softDeleteOwned).mockResolvedValue(true);
    const tx = { sharedNote: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const service = new NotesService(repository, makePrisma([], tx));

    await service.deleteNote("note-1", "user-1");

    expect(repository.softDeleteOwned).toHaveBeenCalledWith("note-1", "user-1", tx);
    expect(tx.sharedNote.deleteMany).toHaveBeenCalledWith({ where: { noteId: "note-1" } });
  });

  it("deleteNote does not error when the note has no share link", async () => {
    const repository = makeRepository();
    vi.mocked(repository.softDeleteOwned).mockResolvedValue(true);
    const tx = { sharedNote: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    const service = new NotesService(repository, makePrisma([], tx));

    await expect(service.deleteNote("note-1", "user-1")).resolves.toBeUndefined();
  });

  describe("tag association", () => {
    it("createNote passes tagIds through to the repository once ownership is verified", async () => {
      const repository = makeRepository();
      vi.mocked(repository.create).mockResolvedValue(RECORD);
      const prisma = makePrisma(["tag-1", "tag-2"]);
      const service = new NotesService(repository, prisma);

      await service.createNote("user-1", CONTENT, ["tag-1", "tag-2"]);

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["tag-1", "tag-2"] }, userId: "user-1" },
        select: { id: true },
      });
      expect(repository.create).toHaveBeenCalledWith({
        userId: "user-1",
        title: "Hello",
        content: CONTENT,
        searchText: "Hello",
        tagIds: ["tag-1", "tag-2"],
      });
    });

    it("createNote throws TAG_NOT_FOUND (422) when a tagId isn't owned by the caller, without creating a note", async () => {
      const repository = makeRepository();
      const prisma = makePrisma(["tag-1"]);
      const service = new NotesService(repository, prisma);

      await expect(service.createNote("user-1", CONTENT, ["tag-1", "tag-2"])).rejects.toMatchObject(
        { code: "TAG_NOT_FOUND", status: 422 },
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("createNote skips the ownership check when tagIds is omitted", async () => {
      const repository = makeRepository();
      vi.mocked(repository.create).mockResolvedValue(RECORD);
      const prisma = makePrisma();
      const service = new NotesService(repository, prisma);

      await service.createNote("user-1", CONTENT);

      expect(prisma.tag.findMany).not.toHaveBeenCalled();
    });

    it("updateNote passes tagIds through to the repository once ownership is verified", async () => {
      const repository = makeRepository();
      vi.mocked(repository.updateOwned).mockResolvedValue(RECORD);
      const prisma = makePrisma(["tag-1"]);
      const service = new NotesService(repository, prisma);

      await service.updateNote("note-1", "user-1", CONTENT, ["tag-1"]);

      expect(repository.updateOwned).toHaveBeenCalledWith("note-1", "user-1", {
        title: "Hello",
        content: CONTENT,
        searchText: "Hello",
        tagIds: ["tag-1"],
      });
    });

    it("updateNote throws TAG_NOT_FOUND (422) when a tagId isn't owned by the caller, without modifying the note", async () => {
      const repository = makeRepository();
      const prisma = makePrisma([]);
      const service = new NotesService(repository, prisma);

      await expect(
        service.updateNote("note-1", "user-1", CONTENT, ["tag-1"]),
      ).rejects.toMatchObject({ code: "TAG_NOT_FOUND", status: 422 });
      expect(repository.updateOwned).not.toHaveBeenCalled();
    });

    it("updateNote skips the ownership check when tagIds is omitted", async () => {
      const repository = makeRepository();
      vi.mocked(repository.updateOwned).mockResolvedValue(RECORD);
      const prisma = makePrisma();
      const service = new NotesService(repository, prisma);

      await service.updateNote("note-1", "user-1", CONTENT);

      expect(prisma.tag.findMany).not.toHaveBeenCalled();
    });

    it("updateNote with an empty tagIds array skips the ownership check but still clears tags", async () => {
      const repository = makeRepository();
      vi.mocked(repository.updateOwned).mockResolvedValue(RECORD);
      const prisma = makePrisma();
      const service = new NotesService(repository, prisma);

      await service.updateNote("note-1", "user-1", CONTENT, []);

      expect(prisma.tag.findMany).not.toHaveBeenCalled();
      expect(repository.updateOwned).toHaveBeenCalledWith("note-1", "user-1", {
        title: "Hello",
        content: CONTENT,
        searchText: "Hello",
        tagIds: [],
      });
    });

    it("createNote throws TAG_NOT_FOUND (422) when the repository write hits a race-condition FK violation", async () => {
      const repository = makeRepository();
      vi.mocked(repository.create).mockRejectedValue(foreignKeyConstraintError());
      const prisma = makePrisma(["tag-1"]);
      const service = new NotesService(repository, prisma);

      await expect(service.createNote("user-1", CONTENT, ["tag-1"])).rejects.toMatchObject({
        code: "TAG_NOT_FOUND",
        status: 422,
      });
    });

    it("updateNote throws TAG_NOT_FOUND (422) when the repository write hits a race-condition FK violation", async () => {
      const repository = makeRepository();
      vi.mocked(repository.updateOwned).mockRejectedValue(foreignKeyConstraintError());
      const prisma = makePrisma(["tag-1"]);
      const service = new NotesService(repository, prisma);

      await expect(
        service.updateNote("note-1", "user-1", CONTENT, ["tag-1"]),
      ).rejects.toMatchObject({ code: "TAG_NOT_FOUND", status: 422 });
    });
  });

  describe("listNotes", () => {
    it("passes the resolved query through to the repository unchanged", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [RECORD], total: 1 });
      const service = new NotesService(repository, makePrisma());
      const query: ListNotesQuery = { ...DEFAULT_QUERY, page: 2, tags: ["work"] };

      await service.listNotes("user-1", query);

      expect(repository.list).toHaveBeenCalledWith("user-1", query);
    });

    it("computes meta for a first page with more pages remaining", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [RECORD], total: 25 });
      const service = new NotesService(repository, makePrisma());

      const result = await service.listNotes("user-1", { ...DEFAULT_QUERY, page: 1, pageSize: 20 });

      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });

    it("computes meta for the last page", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [RECORD], total: 25 });
      const service = new NotesService(repository, makePrisma());

      const result = await service.listNotes("user-1", { ...DEFAULT_QUERY, page: 2, pageSize: 20 });

      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    it("computes meta for a page past the end", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [], total: 5 });
      const service = new NotesService(repository, makePrisma());

      const result = await service.listNotes("user-1", { ...DEFAULT_QUERY, page: 3, pageSize: 20 });

      expect(result.totalPages).toBe(1);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    it("computes totalPages as 0 when there are no matching notes", async () => {
      const repository = makeRepository();
      vi.mocked(repository.list).mockResolvedValue({ notes: [], total: 0 });
      const service = new NotesService(repository, makePrisma());

      const result = await service.listNotes("user-1", DEFAULT_QUERY);

      expect(result.totalPages).toBe(0);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(false);
    });
  });
});
