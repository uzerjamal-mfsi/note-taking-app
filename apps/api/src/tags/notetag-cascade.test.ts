import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

const CONTENT = { type: "doc", content: [{ type: "text", text: "Hello" }] };

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

describe("NoteTag.tagId FK cascade", () => {
  it("deleting a tag whose only association points to a soft-deleted note does not throw an FK violation, and removes the NoteTag row", async () => {
    const user = await createUser();
    const note = await prisma.note.create({
      data: { userId: user.id, title: "Hello", content: CONTENT },
    });
    const tag = await prisma.tag.create({ data: { userId: user.id, name: "work" } });
    await prisma.noteTag.create({ data: { noteId: note.id, tagId: tag.id } });
    await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });

    await expect(prisma.tag.delete({ where: { id: tag.id } })).resolves.toBeDefined();

    expect(
      await prisma.noteTag.findUnique({
        where: { noteId_tagId: { noteId: note.id, tagId: tag.id } },
      }),
    ).toBeNull();
  });

  it("deleting a tag whose only association points to a non-deleted note also cascades at the DB level (the app-level guard is what prevents this, not the FK)", async () => {
    const user = await createUser();
    const note = await prisma.note.create({
      data: { userId: user.id, title: "Hello", content: CONTENT },
    });
    const tag = await prisma.tag.create({ data: { userId: user.id, name: "work" } });
    await prisma.noteTag.create({ data: { noteId: note.id, tagId: tag.id } });

    await expect(prisma.tag.delete({ where: { id: tag.id } })).resolves.toBeDefined();

    expect(
      await prisma.noteTag.findUnique({
        where: { noteId_tagId: { noteId: note.id, tagId: tag.id } },
      }),
    ).toBeNull();
  });
});
