import { randomUUID } from "node:crypto";
import { prisma, PrismaClient } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TagsRepository } from "./tags-repository.js";

const repository = new TagsRepository(prisma);

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

async function createNote(userId: string) {
  return prisma.note.create({
    data: {
      userId,
      title: "Hello",
      content: { type: "doc", content: [{ type: "text", text: "Hi" }] },
    },
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

describe("TagsRepository", () => {
  it("creates a tag owned by the given userId", async () => {
    const user = await createUser();

    const created = await repository.create({ userId: user.id, name: "Work", color: "#FF8800" });

    expect(created.name).toBe("Work");
    expect(created.color).toBe("#FF8800");
    const row = await prisma.tag.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.userId).toBe(user.id);
  });

  it("findOwnedById returns the tag only when id and userId match", async () => {
    const owner = await createUser();
    const other = await createUser();
    const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

    expect((await repository.findOwnedById(tag.id, owner.id))?.id).toBe(tag.id);
    expect(await repository.findOwnedById(tag.id, other.id)).toBeNull();
    expect(await repository.findOwnedById(randomUUID(), owner.id)).toBeNull();
  });

  describe("findOwnedByIdWithActiveCount", () => {
    it("returns the tag with its active-note count only when owned", async () => {
      const owner = await createUser();
      const other = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });
      const activeNote = await createNote(owner.id);
      const deletedNote = await createNote(owner.id);
      await prisma.noteTag.create({ data: { noteId: activeNote.id, tagId: tag.id } });
      await prisma.noteTag.create({ data: { noteId: deletedNote.id, tagId: tag.id } });
      await prisma.note.update({ where: { id: deletedNote.id }, data: { deletedAt: new Date() } });

      expect(await repository.findOwnedByIdWithActiveCount(tag.id, owner.id)).toEqual({
        id: tag.id,
        activeCount: 1,
      });
      expect(await repository.findOwnedByIdWithActiveCount(tag.id, other.id)).toBeNull();
      expect(await repository.findOwnedByIdWithActiveCount(randomUUID(), owner.id)).toBeNull();
    });
  });

  describe("findByName", () => {
    it("finds an existing tag by case-insensitive name for the given user", async () => {
      const owner = await createUser();
      await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

      expect(await repository.findByName(owner.id, "work")).not.toBeNull();
      expect(await repository.findByName(owner.id, "WORK")).not.toBeNull();
    });

    it("does not match another user's tag with the same name", async () => {
      const owner = await createUser();
      const other = await createUser();
      await repository.create({ userId: other.id, name: "Work", color: "#FF8800" });

      expect(await repository.findByName(owner.id, "Work")).toBeNull();
    });

    it("excludes the given tag id when checking for a rename collision", async () => {
      const owner = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

      expect(await repository.findByName(owner.id, "Work", tag.id)).toBeNull();
    });
  });

  describe("listByUser", () => {
    it("returns only the caller's tags, each with noteCount excluding soft-deleted notes", async () => {
      const owner = await createUser();
      const other = await createUser();
      const busyTag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });
      const idleTag = await repository.create({
        userId: owner.id,
        name: "Personal",
        color: "#00FF00",
      });
      await repository.create({ userId: other.id, name: "Other", color: "#0000FF" });

      const activeNote = await createNote(owner.id);
      const deletedNote = await createNote(owner.id);
      await prisma.noteTag.create({ data: { noteId: activeNote.id, tagId: busyTag.id } });
      await prisma.noteTag.create({ data: { noteId: deletedNote.id, tagId: busyTag.id } });
      await prisma.note.update({ where: { id: deletedNote.id }, data: { deletedAt: new Date() } });

      const tags = await repository.listByUser(owner.id);

      expect(tags.map((t) => t.id).sort()).toEqual([busyTag.id, idleTag.id].sort());
      expect(tags.find((t) => t.id === busyTag.id)?.noteCount).toBe(1);
      expect(tags.find((t) => t.id === idleTag.id)?.noteCount).toBe(0);
    });

    it("issues a single query regardless of tag count (no N+1)", async () => {
      const owner = await createUser();
      for (let i = 0; i < 5; i += 1) {
        await repository.create({ userId: owner.id, name: `Tag ${i}`, color: "#FF8800" });
      }

      const loggingClient = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
      const loggingRepository = new TagsRepository(loggingClient);
      let queryCount = 0;
      loggingClient.$on("query", () => {
        queryCount += 1;
      });

      const tags = await loggingRepository.listByUser(owner.id);
      await loggingClient.$disconnect();

      expect(tags).toHaveLength(5);
      expect(queryCount).toBe(1);
    });
  });

  describe("update", () => {
    it("updates name and/or color and returns the updated row", async () => {
      const owner = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

      const updated = await repository.update(tag.id, owner.id, { name: "Job", color: "#00FF00" });

      expect(updated?.name).toBe("Job");
      expect(updated?.color).toBe("#00FF00");
    });

    it("returns null when the tag doesn't exist or isn't owned by the caller", async () => {
      const owner = await createUser();
      const other = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

      expect(await repository.update(randomUUID(), owner.id, { name: "Job" })).toBeNull();
      expect(await repository.update(tag.id, other.id, { name: "Job" })).toBeNull();
    });
  });

  describe("countActiveNotesForTag", () => {
    it("counts only non-deleted notes carrying the tag", async () => {
      const owner = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });
      const activeNote = await createNote(owner.id);
      const deletedNote = await createNote(owner.id);
      await prisma.noteTag.create({ data: { noteId: activeNote.id, tagId: tag.id } });
      await prisma.noteTag.create({ data: { noteId: deletedNote.id, tagId: tag.id } });
      await prisma.note.update({ where: { id: deletedNote.id }, data: { deletedAt: new Date() } });

      expect(await repository.countActiveNotesForTag(tag.id)).toBe(1);
    });

    it("returns 0 for a tag with no associations", async () => {
      const owner = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

      expect(await repository.countActiveNotesForTag(tag.id)).toBe(0);
    });
  });

  describe("deleteOwned", () => {
    it("deletes the tag and returns true", async () => {
      const owner = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

      expect(await repository.deleteOwned(tag.id, owner.id)).toBe(true);
      expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
    });

    it("returns false when the tag doesn't exist or isn't owned by the caller", async () => {
      const owner = await createUser();
      const other = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });

      expect(await repository.deleteOwned(randomUUID(), owner.id)).toBe(false);
      expect(await repository.deleteOwned(tag.id, other.id)).toBe(false);
    });

    it("deleting a tag carried only by soft-deleted notes cascades its NoteTag rows without an FK violation", async () => {
      const owner = await createUser();
      const tag = await repository.create({ userId: owner.id, name: "Work", color: "#FF8800" });
      const note = await createNote(owner.id);
      await prisma.noteTag.create({ data: { noteId: note.id, tagId: tag.id } });
      await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });

      expect(await repository.deleteOwned(tag.id, owner.id)).toBe(true);
      expect(
        await prisma.noteTag.findUnique({
          where: { noteId_tagId: { noteId: note.id, tagId: tag.id } },
        }),
      ).toBeNull();
    });
  });
});
