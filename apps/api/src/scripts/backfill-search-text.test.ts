import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { backfillSearchText } from "./backfill-search-text.js";

const CONTENT = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Grocery list eggs milk" }] }],
};

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

/** Bypasses NotesService/NotesRepository entirely, simulating a pre-existing row whose searchText was never populated. */
async function seedNoteDirectly(userId: string) {
  return prisma.note.create({
    data: { userId, title: "Grocery list", content: CONTENT },
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

describe("backfillSearchText", () => {
  it("populates searchText for a note seeded with the column's empty default", async () => {
    const owner = await createUser();
    const note = await seedNoteDirectly(owner.id);
    expect(note.searchText).toBe("");

    const updated = await backfillSearchText(prisma);

    expect(updated).toBe(1);
    const row = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.searchText).toBe("Grocery list eggs milk");
  });

  it("is idempotent: running it twice leaves searchText unchanged", async () => {
    const owner = await createUser();
    const note = await seedNoteDirectly(owner.id);

    await backfillSearchText(prisma);
    const afterFirst = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });

    await backfillSearchText(prisma);
    const afterSecond = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });

    expect(afterSecond.searchText).toBe(afterFirst.searchText);
  });

  it("skips notes whose searchText is already correct, and only reports the ones it changed", async () => {
    const owner = await createUser();
    await seedNoteDirectly(owner.id);

    await backfillSearchText(prisma);
    const secondRunCount = await backfillSearchText(prisma);

    expect(secondRunCount).toBe(0);
  });

  it("processes notes across multiple batches", async () => {
    const owner = await createUser();
    for (let i = 0; i < 5; i += 1) {
      await seedNoteDirectly(owner.id);
    }

    const updated = await backfillSearchText(prisma, { batchSize: 2 });

    expect(updated).toBe(5);
    const rows = await prisma.note.findMany({ where: { userId: owner.id } });
    expect(rows.every((row) => row.searchText === "Grocery list eggs milk")).toBe(true);
  });

  it("stops after an exact multiple of batchSize, once a follow-up fetch returns no rows", async () => {
    const owner = await createUser();
    for (let i = 0; i < 4; i += 1) {
      await seedNoteDirectly(owner.id);
    }

    const updated = await backfillSearchText(prisma, { batchSize: 2 });

    expect(updated).toBe(4);
  });
});
