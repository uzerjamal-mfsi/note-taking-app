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
    listOwned: vi.fn(),
    updateOwned: vi.fn(),
    softDeleteOwned: vi.fn(),
  } as unknown as NotesRepository;
}

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
});
