import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { RefreshTokenRepository } from "./refresh-token-repository.js";

const repository = new RefreshTokenRepository(prisma);

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

const HOUR_MS = 60 * 60 * 1000;

beforeEach(async () => {
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("RefreshTokenRepository", () => {
  it("creates a new session row establishing its own family", async () => {
    const user = await createUser();

    const created = await repository.create({
      userId: user.id,
      tokenHash: "hash-1",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    expect(created.familyId).toBe(created.id);
    expect(created.revokedAt).toBeNull();
  });

  it("finds an active row by token hash", async () => {
    const user = await createUser();
    const created = await repository.create({
      userId: user.id,
      tokenHash: "hash-2",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    const found = await repository.findActiveByTokenHash("hash-2");

    expect(found?.id).toBe(created.id);
  });

  it("does not return an expired row as active", async () => {
    const user = await createUser();
    await repository.create({
      userId: user.id,
      tokenHash: "hash-expired",
      expiresAt: new Date(Date.now() - HOUR_MS),
    });

    const found = await repository.findActiveByTokenHash("hash-expired");

    expect(found).toBeNull();
  });

  it("rotates a row: revokes the old one and inserts a new one in the same family", async () => {
    const user = await createUser();
    const original = await repository.create({
      userId: user.id,
      tokenHash: "hash-3",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    const rotated = await repository.rotate(original, {
      tokenHash: "hash-3-next",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    expect(rotated).not.toBeNull();
    const oldRow = await prisma.refreshToken.findUniqueOrThrow({ where: { id: original.id } });
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedByTokenId).toBe(rotated!.id);
    expect(rotated!.familyId).toBe(original.familyId);
    expect(rotated!.revokedAt).toBeNull();
  });

  it("loses a concurrent rotation race without leaving a duplicate live child", async () => {
    const user = await createUser();
    const original = await repository.create({
      userId: user.id,
      tokenHash: "hash-race",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    // Simulate two requests racing to rotate the same still-valid token.
    const [first, second] = await Promise.all([
      repository.rotate(original, {
        tokenHash: "hash-race-child-a",
        expiresAt: new Date(Date.now() + HOUR_MS),
      }),
      repository.rotate(original, {
        tokenHash: "hash-race-child-b",
        expiresAt: new Date(Date.now() + HOUR_MS),
      }),
    ]);

    const winners = [first, second].filter((result) => result !== null);
    expect(winners).toHaveLength(1);

    const familyRows = await prisma.refreshToken.findMany({
      where: { familyId: original.familyId },
    });
    const liveRows = familyRows.filter((row) => row.revokedAt === null);
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]?.id).toBe(winners[0]!.id);
  });

  it("a revoked row is excluded from active lookups", async () => {
    const user = await createUser();
    const original = await repository.create({
      userId: user.id,
      tokenHash: "hash-4",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
    await repository.rotate(original, {
      tokenHash: "hash-4-next",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    const found = await repository.findActiveByTokenHash("hash-4");

    expect(found).toBeNull();
  });

  it("revokes every row in a family", async () => {
    const user = await createUser();
    const original = await repository.create({
      userId: user.id,
      tokenHash: "hash-5",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
    const rotated = await repository.rotate(original, {
      tokenHash: "hash-5-next",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
    expect(rotated).not.toBeNull();

    await repository.revokeFamily(original.familyId);

    const rows = await prisma.refreshToken.findMany({ where: { familyId: original.familyId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
    expect(await repository.findActiveByTokenHash("hash-5-next")).toBeNull();
    expect(rotated!.familyId).toBe(original.familyId);
  });

  it("finds a row by token hash regardless of revoked state", async () => {
    const user = await createUser();
    const original = await repository.create({
      userId: user.id,
      tokenHash: "hash-8",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
    await repository.revoke(original.id);

    const found = await repository.findByTokenHash("hash-8");

    expect(found?.id).toBe(original.id);
    expect(found?.revokedAt).not.toBeNull();
  });

  it("revokes only the presented row on a single-token revoke", async () => {
    const user = await createUser();
    const original = await repository.create({
      userId: user.id,
      tokenHash: "hash-6",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    await repository.revoke(original.id);

    const row = await prisma.refreshToken.findUniqueOrThrow({ where: { id: original.id } });
    expect(row.revokedAt).not.toBeNull();
  });

  it("does not leave the presented token revoked if the rotation's insert step fails", async () => {
    const user = await createUser();
    const original = await repository.create({
      userId: user.id,
      tokenHash: "hash-7",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    // Reusing the same tokenHash as `original` forces the insert to violate
    // the unique constraint, simulating a mid-rotation failure.
    await expect(
      repository.rotate(original, {
        tokenHash: "hash-7",
        expiresAt: new Date(Date.now() + HOUR_MS),
      }),
    ).rejects.toThrow();

    const row = await prisma.refreshToken.findUniqueOrThrow({ where: { id: original.id } });
    expect(row.revokedAt).toBeNull();
  });
});
