import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotesRepository } from "./notes-repository.js";

const repository = new NotesRepository(prisma);

const CONTENT = { type: "doc", content: [{ type: "text", text: "Hello" }] };

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

beforeEach(async () => {
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

  it("listOwned returns only the given user's non-deleted notes", async () => {
    const owner = await createUser();
    const other = await createUser();
    const kept = await repository.create({ userId: owner.id, title: "Keep", content: CONTENT });
    const deleted = await repository.create({ userId: owner.id, title: "Gone", content: CONTENT });
    await repository.create({ userId: other.id, title: "Not mine", content: CONTENT });
    await repository.softDeleteOwned(deleted.id, owner.id);

    const list = await repository.listOwned(owner.id);

    expect(list.map((n) => n.id)).toEqual([kept.id]);
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
});
