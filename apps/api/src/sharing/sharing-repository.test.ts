import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SharingRepository } from "./sharing-repository.js";

const repository = new SharingRepository(prisma);

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

describe("SharingRepository", () => {
  describe("findActiveByNoteId", () => {
    it("returns null when no share link exists", async () => {
      const { note } = await createUserAndNote();

      expect(await repository.findActiveByNoteId(note.id)).toBeNull();
    });

    it("returns the link when it has no expiry", async () => {
      const { note } = await createUserAndNote();
      const created = await repository.createForNote(note.id, "tok-1", null);

      const found = await repository.findActiveByNoteId(note.id);

      expect(found?.token).toBe(created.token);
    });

    it("returns null when the only link has expired", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-expired", new Date(Date.now() - 1000));

      expect(await repository.findActiveByNoteId(note.id)).toBeNull();
    });

    it("returns the link when its expiry is in the future", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-future", new Date(Date.now() + 60_000));

      expect((await repository.findActiveByNoteId(note.id))?.token).toBe("tok-future");
    });
  });

  describe("createForNote", () => {
    it("creates a link with viewCount 0 when none exists", async () => {
      const { note } = await createUserAndNote();

      const created = await repository.createForNote(note.id, "tok-1", null);

      expect(created.viewCount).toBe(0);
      expect(created.expiresAt).toBeNull();
    });

    it("replaces an expired link, and the old token no longer matches", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-old", new Date(Date.now() - 1000));

      const created = await repository.createForNote(note.id, "tok-new", null);

      expect(created.token).toBe("tok-new");
      expect(await repository.incrementIfActiveAndReadNote("tok-old")).toBeNull();
      const row = await prisma.sharedNote.findUnique({ where: { noteId: note.id } });
      expect(row?.token).toBe("tok-new");
    });
  });

  describe("deleteActiveByNoteId", () => {
    it("deletes an active link and returns true", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-1", null);

      const result = await repository.deleteActiveByNoteId(note.id);

      expect(result).toBe(true);
      expect(await prisma.sharedNote.findUnique({ where: { noteId: note.id } })).toBeNull();
    });

    it("returns false and changes nothing when no active link exists", async () => {
      const { note } = await createUserAndNote();

      expect(await repository.deleteActiveByNoteId(note.id)).toBe(false);
    });

    it("returns false and leaves an expired link untouched", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-expired", new Date(Date.now() - 1000));

      expect(await repository.deleteActiveByNoteId(note.id)).toBe(false);
      expect(await prisma.sharedNote.findUnique({ where: { noteId: note.id } })).not.toBeNull();
    });
  });

  describe("incrementIfActiveAndReadNote", () => {
    it("increments viewCount and returns the note's title/content", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-1", null);

      const result = await repository.incrementIfActiveAndReadNote("tok-1");

      expect(result).toEqual({ title: "Hello", content: CONTENT });
      const row = await prisma.sharedNote.findUnique({ where: { noteId: note.id } });
      expect(row?.viewCount).toBe(1);
    });

    it("returns null and changes nothing for an unknown token", async () => {
      expect(await repository.incrementIfActiveAndReadNote("no-such-token")).toBeNull();
    });

    it("returns null and changes nothing for an expired link", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-expired", new Date(Date.now() - 1000));

      expect(await repository.incrementIfActiveAndReadNote("tok-expired")).toBeNull();
      const row = await prisma.sharedNote.findUnique({ where: { noteId: note.id } });
      expect(row?.viewCount).toBe(0);
    });

    it("returns null and changes nothing when the note has been soft-deleted", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-1", null);
      await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });

      expect(await repository.incrementIfActiveAndReadNote("tok-1")).toBeNull();
      const row = await prisma.sharedNote.findUnique({ where: { noteId: note.id } });
      expect(row?.viewCount).toBe(0);
    });

    it("has no lost updates under concurrent increments", async () => {
      const { note } = await createUserAndNote();
      await repository.createForNote(note.id, "tok-concurrent", null);

      await Promise.all(
        Array.from({ length: 20 }, () => repository.incrementIfActiveAndReadNote("tok-concurrent")),
      );

      const row = await prisma.sharedNote.findUnique({ where: { noteId: note.id } });
      expect(row?.viewCount).toBe(20);
    });
  });
});
