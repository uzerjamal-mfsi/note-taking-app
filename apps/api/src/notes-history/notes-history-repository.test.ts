import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotesHistoryRepository } from "./notes-history-repository.js";

const repository = new NotesHistoryRepository(prisma);

const CONTENT = { type: "doc", content: [{ type: "text", text: "Hello" }] };

async function createUserAndNote() {
  const user = await prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
  const note = await prisma.note.create({
    data: { userId: user.id, title: "Hello", content: CONTENT },
  });
  return { user, note };
}

beforeEach(async () => {
  await prisma.noteVersion.deleteMany();
  await prisma.sharedNote.deleteMany();
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

describe("NotesHistoryRepository", () => {
  describe("snapshot", () => {
    it("creates a NoteVersion row capturing the given content and title", async () => {
      const { note } = await createUserAndNote();

      await prisma.$transaction((tx) => repository.snapshot(tx, note.id, CONTENT, "Hello"));

      const rows = await prisma.noteVersion.findMany({ where: { noteId: note.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.content).toEqual(CONTENT);
      expect(rows[0]?.title).toBe("Hello");
    });
  });

  describe("purgeOlderThan30Days", () => {
    it("deletes only that note's versions past the 30-day cutoff", async () => {
      const { note } = await createUserAndNote();
      const old = await prisma.noteVersion.create({
        data: {
          noteId: note.id,
          content: CONTENT,
          title: "Old",
          createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });
      const recent = await prisma.noteVersion.create({
        data: { noteId: note.id, content: CONTENT, title: "Recent" },
      });

      await prisma.$transaction((tx) => repository.purgeOlderThan30Days(tx, note.id));

      const remaining = await prisma.noteVersion.findMany({ where: { noteId: note.id } });
      expect(remaining.map((v) => v.id)).toEqual([recent.id]);
      expect(remaining.map((v) => v.id)).not.toContain(old.id);
    });

    it("leaves other notes' versions untouched", async () => {
      const { note: noteA } = await createUserAndNote();
      const { note: noteB } = await createUserAndNote();
      await prisma.noteVersion.create({
        data: {
          noteId: noteB.id,
          content: CONTENT,
          title: "Old",
          createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });

      await prisma.$transaction((tx) => repository.purgeOlderThan30Days(tx, noteA.id));

      expect(await prisma.noteVersion.count({ where: { noteId: noteB.id } })).toBe(1);
    });
  });

  describe("listForNote", () => {
    it("returns versions ordered most-recently-created first, with summary fields only", async () => {
      const { note } = await createUserAndNote();
      const first = await prisma.noteVersion.create({
        data: {
          noteId: note.id,
          content: CONTENT,
          title: "First",
          createdAt: new Date(Date.now() - 1000),
        },
      });
      const second = await prisma.noteVersion.create({
        data: { noteId: note.id, content: CONTENT, title: "Second" },
      });

      const versions = await repository.listForNote(note.id);

      expect(versions.map((v) => v.id)).toEqual([second.id, first.id]);
      expect(versions[0]).not.toHaveProperty("content");
    });

    it("returns an empty array when the note has no versions", async () => {
      const { note } = await createUserAndNote();

      expect(await repository.listForNote(note.id)).toEqual([]);
    });
  });

  describe("getOneForNote", () => {
    it("returns the version, including content, when it belongs to the note", async () => {
      const { note } = await createUserAndNote();
      const version = await prisma.noteVersion.create({
        data: { noteId: note.id, content: CONTENT, title: "Hello" },
      });

      const found = await repository.getOneForNote(note.id, version.id);

      expect(found?.id).toBe(version.id);
      expect(found?.content).toEqual(CONTENT);
    });

    it("returns null when versionId does not exist", async () => {
      const { note } = await createUserAndNote();

      expect(await repository.getOneForNote(note.id, randomUUID())).toBeNull();
    });

    it("returns null when versionId exists but belongs to a different note", async () => {
      const { note: noteA } = await createUserAndNote();
      const { note: noteB } = await createUserAndNote();
      const version = await prisma.noteVersion.create({
        data: { noteId: noteB.id, content: CONTENT, title: "Hello" },
      });

      expect(await repository.getOneForNote(noteA.id, version.id)).toBeNull();
    });
  });
});
