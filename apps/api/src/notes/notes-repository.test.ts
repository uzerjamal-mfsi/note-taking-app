import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import type { ListNotesQuery } from "@note-taking-app/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotesRepository } from "./notes-repository.js";

const repository = new NotesRepository(prisma);

const CONTENT = { type: "doc", content: [{ type: "text", text: "Hello" }] };

const DEFAULT_QUERY: ListNotesQuery = {
  page: 1,
  pageSize: 20,
  sortBy: "updatedAt",
  sortDir: "desc",
  tags: undefined,
};

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

// These tests exercise the tag *filter* on GET /notes, not tag *creation*
// (AB-1006 adds tag association via `tagIds` on create/update, tested
// separately below), so they still seed tags directly via Prisma.
async function tagNote(userId: string, noteId: string, name: string) {
  const tag = await prisma.tag.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name },
    update: {},
  });
  await prisma.noteTag.create({ data: { noteId, tagId: tag.id } });
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

describe("NotesRepository", () => {
  it("creates a note owned by the given userId", async () => {
    const user = await createUser();

    const created = await repository.create({ userId: user.id, title: "Hello", content: CONTENT });

    expect(created.title).toBe("Hello");
    const row = await prisma.note.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.userId).toBe(user.id);
    expect(row.deletedAt).toBeNull();
  });

  it("findOwned returns the note only when id and userId match and it is not deleted", async () => {
    const owner = await createUser();
    const other = await createUser();
    const note = await repository.create({ userId: owner.id, title: "Hello", content: CONTENT });

    expect((await repository.findOwned(note.id, owner.id))?.id).toBe(note.id);
    expect(await repository.findOwned(note.id, other.id)).toBeNull();
    expect(await repository.findOwned(randomUUID(), owner.id)).toBeNull();

    await repository.softDeleteOwned(note.id, owner.id);
    expect(await repository.findOwned(note.id, owner.id)).toBeNull();
  });

  describe("list", () => {
    it("returns only the given user's non-deleted notes, and the matching total", async () => {
      const owner = await createUser();
      const other = await createUser();
      const kept = await repository.create({ userId: owner.id, title: "Keep", content: CONTENT });
      const deleted = await repository.create({
        userId: owner.id,
        title: "Gone",
        content: CONTENT,
      });
      await repository.create({ userId: other.id, title: "Not mine", content: CONTENT });
      await repository.softDeleteOwned(deleted.id, owner.id);

      const result = await repository.list(owner.id, DEFAULT_QUERY);

      expect(result.notes.map((n) => n.id)).toEqual([kept.id]);
      expect(result.total).toBe(1);
    });

    it("applies default pagination (page 1, pageSize 20)", async () => {
      const owner = await createUser();
      for (let i = 0; i < 25; i += 1) {
        await repository.create({ userId: owner.id, title: `Note ${i}`, content: CONTENT });
      }

      const result = await repository.list(owner.id, DEFAULT_QUERY);

      expect(result.notes).toHaveLength(20);
      expect(result.total).toBe(25);
    });

    it("returns the remaining notes on a later page", async () => {
      const owner = await createUser();
      for (let i = 0; i < 25; i += 1) {
        await repository.create({ userId: owner.id, title: `Note ${i}`, content: CONTENT });
      }

      const result = await repository.list(owner.id, { ...DEFAULT_QUERY, page: 2 });

      expect(result.notes).toHaveLength(5);
      expect(result.total).toBe(25);
    });

    it("returns an empty page and the correct total for a page past the end", async () => {
      const owner = await createUser();
      await repository.create({ userId: owner.id, title: "Only one", content: CONTENT });

      const result = await repository.list(owner.id, { ...DEFAULT_QUERY, page: 3 });

      expect(result.notes).toEqual([]);
      expect(result.total).toBe(1);
    });

    it("sorts by createdAt ascending when requested", async () => {
      const owner = await createUser();
      const first = await repository.create({ userId: owner.id, title: "First", content: CONTENT });
      const second = await repository.create({
        userId: owner.id,
        title: "Second",
        content: CONTENT,
      });

      const result = await repository.list(owner.id, {
        ...DEFAULT_QUERY,
        sortBy: "createdAt",
        sortDir: "asc",
      });

      expect(result.notes.map((n) => n.id)).toEqual([first.id, second.id]);
    });

    it("breaks ties on sortBy deterministically by id, stable across repeated requests", async () => {
      const owner = await createUser();
      const tiedAt = new Date();
      const createdIds: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const note = await repository.create({
          userId: owner.id,
          title: `Note ${i}`,
          content: CONTENT,
        });
        createdIds.push(note.id);
      }
      // Force every note to share the same updatedAt so only the id tie-breaker
      // can determine order.
      await prisma.note.updateMany({ where: { userId: owner.id }, data: { updatedAt: tiedAt } });

      const first = await repository.list(owner.id, DEFAULT_QUERY);
      const second = await repository.list(owner.id, DEFAULT_QUERY);

      const expectedOrder = [...createdIds].sort().reverse();
      expect(first.notes.map((n) => n.id)).toEqual(expectedOrder);
      expect(second.notes.map((n) => n.id)).toEqual(expectedOrder);
    });

    it("filters by a single tag", async () => {
      const owner = await createUser();
      const tagged = await repository.create({
        userId: owner.id,
        title: "Tagged",
        content: CONTENT,
      });
      await repository.create({ userId: owner.id, title: "Untagged", content: CONTENT });
      await tagNote(owner.id, tagged.id, "work");

      const result = await repository.list(owner.id, { ...DEFAULT_QUERY, tags: ["work"] });

      expect(result.notes.map((n) => n.id)).toEqual([tagged.id]);
      expect(result.total).toBe(1);
    });

    it("filters by multiple tags using OR", async () => {
      const owner = await createUser();
      const workNote = await repository.create({
        userId: owner.id,
        title: "Work",
        content: CONTENT,
      });
      const personalNote = await repository.create({
        userId: owner.id,
        title: "Personal",
        content: CONTENT,
      });
      await repository.create({ userId: owner.id, title: "Neither", content: CONTENT });
      await tagNote(owner.id, workNote.id, "work");
      await tagNote(owner.id, personalNote.id, "personal");

      const result = await repository.list(owner.id, {
        ...DEFAULT_QUERY,
        tags: ["work", "personal"],
      });

      expect(result.notes.map((n) => n.id).sort()).toEqual([workNote.id, personalNote.id].sort());
    });

    it("matches tags case-insensitively", async () => {
      const owner = await createUser();
      const note = await repository.create({ userId: owner.id, title: "Note", content: CONTENT });
      await tagNote(owner.id, note.id, "work");

      const result = await repository.list(owner.id, { ...DEFAULT_QUERY, tags: ["Work"] });

      expect(result.notes.map((n) => n.id)).toEqual([note.id]);
    });

    it("returns an empty page when no note has the requested tag", async () => {
      const owner = await createUser();
      await repository.create({ userId: owner.id, title: "Note", content: CONTENT });

      const result = await repository.list(owner.id, { ...DEFAULT_QUERY, tags: ["nonexistent"] });

      expect(result.notes).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("excludes a soft-deleted note from both the page and the total", async () => {
      const owner = await createUser();
      const kept = await repository.create({ userId: owner.id, title: "Keep", content: CONTENT });
      const deleted = await repository.create({
        userId: owner.id,
        title: "Gone",
        content: CONTENT,
      });
      await repository.softDeleteOwned(deleted.id, owner.id);

      const result = await repository.list(owner.id, DEFAULT_QUERY);

      expect(result.notes.map((n) => n.id)).toEqual([kept.id]);
      expect(result.total).toBe(1);
    });
  });

  it("updateOwned replaces title/content and returns the updated row", async () => {
    const owner = await createUser();
    const note = await repository.create({ userId: owner.id, title: "Hello", content: CONTENT });
    const nextContent = { type: "doc", content: [{ type: "text", text: "Updated" }] };

    const updated = await repository.updateOwned(note.id, owner.id, {
      title: "Updated",
      content: nextContent,
    });

    expect(updated?.title).toBe("Updated");
    expect(updated?.content).toEqual(nextContent);
  });

  it("updateOwned returns null when the note doesn't exist, isn't owned, or is already deleted", async () => {
    const owner = await createUser();
    const other = await createUser();
    const note = await repository.create({ userId: owner.id, title: "Hello", content: CONTENT });
    const deleted = await repository.create({ userId: owner.id, title: "Gone", content: CONTENT });
    await repository.softDeleteOwned(deleted.id, owner.id);

    expect(
      await repository.updateOwned(randomUUID(), owner.id, { title: "x", content: CONTENT }),
    ).toBeNull();
    expect(
      await repository.updateOwned(note.id, other.id, { title: "x", content: CONTENT }),
    ).toBeNull();
    expect(
      await repository.updateOwned(deleted.id, owner.id, { title: "x", content: CONTENT }),
    ).toBeNull();
  });

  it("softDeleteOwned sets deletedAt and returns true", async () => {
    const owner = await createUser();
    const note = await repository.create({ userId: owner.id, title: "Hello", content: CONTENT });

    const result = await repository.softDeleteOwned(note.id, owner.id);

    expect(result).toBe(true);
    const row = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.deletedAt).not.toBeNull();
  });

  it("softDeleteOwned returns false when the note doesn't exist, isn't owned, or is already deleted", async () => {
    const owner = await createUser();
    const other = await createUser();
    const note = await repository.create({ userId: owner.id, title: "Hello", content: CONTENT });

    expect(await repository.softDeleteOwned(randomUUID(), owner.id)).toBe(false);
    expect(await repository.softDeleteOwned(note.id, other.id)).toBe(false);
    expect(await repository.softDeleteOwned(note.id, owner.id)).toBe(true);
    expect(await repository.softDeleteOwned(note.id, owner.id)).toBe(false);
  });

  describe("tag association", () => {
    async function createTag(userId: string, name: string) {
      return prisma.tag.create({ data: { userId, name, color: "#FF8800" } });
    }

    it("create associates the note with the given tagIds and returns each tag's id/name/color", async () => {
      const owner = await createUser();
      const work = await createTag(owner.id, "work");
      const personal = await createTag(owner.id, "personal");

      const created = await repository.create({
        userId: owner.id,
        title: "Hello",
        content: CONTENT,
        tagIds: [work.id, personal.id],
      });

      expect(created.tags.map((t) => t.tag).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { id: personal.id, name: "personal", color: "#FF8800" },
        { id: work.id, name: "work", color: "#FF8800" },
      ]);
    });

    it("create with tagIds omitted associates no tags", async () => {
      const owner = await createUser();

      const created = await repository.create({
        userId: owner.id,
        title: "Hello",
        content: CONTENT,
      });

      expect(created.tags).toEqual([]);
    });

    it("updateOwned with tagIds fully replaces the note's tag associations", async () => {
      const owner = await createUser();
      const work = await createTag(owner.id, "work");
      const personal = await createTag(owner.id, "personal");
      const note = await repository.create({
        userId: owner.id,
        title: "Hello",
        content: CONTENT,
        tagIds: [work.id],
      });

      const updated = await repository.updateOwned(note.id, owner.id, {
        title: "Hello",
        content: CONTENT,
        tagIds: [personal.id],
      });

      expect(updated?.tags.map((t) => t.tag.id)).toEqual([personal.id]);
    });

    it("updateOwned with an empty tagIds array clears all tag associations", async () => {
      const owner = await createUser();
      const work = await createTag(owner.id, "work");
      const note = await repository.create({
        userId: owner.id,
        title: "Hello",
        content: CONTENT,
        tagIds: [work.id],
      });

      const updated = await repository.updateOwned(note.id, owner.id, {
        title: "Hello",
        content: CONTENT,
        tagIds: [],
      });

      expect(updated?.tags).toEqual([]);
    });

    it("updateOwned with tagIds omitted leaves existing tag associations untouched", async () => {
      const owner = await createUser();
      const work = await createTag(owner.id, "work");
      const note = await repository.create({
        userId: owner.id,
        title: "Hello",
        content: CONTENT,
        tagIds: [work.id],
      });

      const updated = await repository.updateOwned(note.id, owner.id, {
        title: "Updated",
        content: CONTENT,
      });

      expect(updated?.tags.map((t) => t.tag.id)).toEqual([work.id]);
    });
  });
});
