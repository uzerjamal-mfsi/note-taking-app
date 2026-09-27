import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotesRepository } from "../notes/notes-repository.js";
import { NotesSearchRepository } from "./notes-search-repository.js";

const repository = new NotesSearchRepository(prisma);
const notesRepository = new NotesRepository(prisma);

const DEFAULT_QUERY = { page: 1, pageSize: 20 };

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

function docWithText(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function createNote(userId: string, title: string, bodyText: string) {
  return notesRepository.create({
    userId,
    title,
    content: docWithText(bodyText),
    searchText: bodyText,
  });
}

beforeEach(async () => {
  await prisma.noteTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("NotesSearchRepository", () => {
  it("matches a note whose title or body contains the query term", async () => {
    const owner = await createUser();
    const note = await createNote(owner.id, "Grocery list", "Buy eggs and milk");

    const result = await repository.search(owner.id, { q: "grocery", ...DEFAULT_QUERY });

    expect(result.results.map((r) => r.id)).toEqual([note.id]);
    expect(result.total).toBe(1);
  });

  it("ranks a title match ahead of a body-only match", async () => {
    const owner = await createUser();
    const bodyOnly = await createNote(owner.id, "Unrelated", "a quick meeting note");
    const titleMatch = await createNote(owner.id, "Meeting notes", "nothing special here");

    const result = await repository.search(owner.id, { q: "meeting", ...DEFAULT_QUERY });

    expect(result.results.map((r) => r.id)).toEqual([titleMatch.id, bodyOnly.id]);
  });

  it("breaks ties deterministically by id descending, stable across repeated requests", async () => {
    const owner = await createUser();
    const created = [];
    for (let i = 0; i < 4; i += 1) {
      created.push((await createNote(owner.id, `Budget ${i}`, "budget details")).id);
    }

    const first = await repository.search(owner.id, { q: "budget", ...DEFAULT_QUERY });
    const second = await repository.search(owner.id, { q: "budget", ...DEFAULT_QUERY });

    const expectedOrder = [...created].sort().reverse();
    expect(first.results.map((r) => r.id)).toEqual(expectedOrder);
    expect(second.results.map((r) => r.id)).toEqual(expectedOrder);
  });

  it("excludes another user's notes and the caller's soft-deleted notes", async () => {
    const owner = await createUser();
    const other = await createUser();
    const kept = await createNote(owner.id, "Budget plan", "budget details");
    const deleted = await createNote(owner.id, "Budget archive", "old budget details");
    await notesRepository.softDeleteOwned(deleted.id, owner.id);
    await createNote(other.id, "Budget (other user)", "budget details");

    const result = await repository.search(owner.id, { q: "budget", ...DEFAULT_QUERY });

    expect(result.results.map((r) => r.id)).toEqual([kept.id]);
    expect(result.total).toBe(1);
  });

  it("returns an empty page and zero total for no matches", async () => {
    const owner = await createUser();
    await createNote(owner.id, "Grocery list", "eggs and milk");

    const result = await repository.search(owner.id, { q: "nonexistentword", ...DEFAULT_QUERY });

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns an empty page (not an error) when the query has no searchable terms", async () => {
    const owner = await createUser();
    await createNote(owner.id, "The", "the a an"); // all stopwords

    const result = await repository.search(owner.id, { q: "the", ...DEFAULT_QUERY });

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("paginates results", async () => {
    const owner = await createUser();
    const created = [];
    for (let i = 0; i < 5; i += 1) {
      created.push((await createNote(owner.id, `Budget ${i}`, "budget details")).id);
    }

    const page1 = await repository.search(owner.id, { q: "budget", page: 1, pageSize: 2 });
    const page2 = await repository.search(owner.id, { q: "budget", page: 2, pageSize: 2 });

    expect(page1.results).toHaveLength(2);
    expect(page2.results).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.results.map((r) => r.id)).not.toEqual(page2.results.map((r) => r.id));
  });

  it("returns an empty page (not an error) for a page beyond the last page", async () => {
    const owner = await createUser();
    await createNote(owner.id, "Budget", "budget details");

    const result = await repository.search(owner.id, { q: "budget", page: 3, pageSize: 20 });

    expect(result.results).toEqual([]);
    expect(result.total).toBe(1);
  });

  it("includes each note's tags", async () => {
    const owner = await createUser();
    const tag = await prisma.tag.create({
      data: { userId: owner.id, name: "work", color: "#FF8800" },
    });
    const note = await createNote(owner.id, "Budget", "budget details");
    await prisma.noteTag.create({ data: { noteId: note.id, tagId: tag.id } });

    const result = await repository.search(owner.id, { q: "budget", ...DEFAULT_QUERY });

    expect(result.results[0]?.tags).toEqual([{ id: tag.id, name: "work", color: "#FF8800" }]);
  });

  it("returns raw sentinel-delimited highlight text for title and snippet", async () => {
    const owner = await createUser();
    await createNote(owner.id, "Grocery list", "Buy eggs and milk");

    const result = await repository.search(owner.id, { q: "grocery", ...DEFAULT_QUERY });

    expect(result.results[0]?.titleHighlighted).toContain("\u0001Grocery\u0002");
  });
});
