import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAccessToken } from "./access-token.js";
import { RefreshTokenRepository } from "./refresh-token-repository.js";
import { SessionService } from "./session-service.js";

const ACCESS_SECRET = "test-access-secret";
const REFRESH_SECRET = "test-refresh-secret";

const repository = new RefreshTokenRepository(prisma);
const sessionService = new SessionService(repository, {
  accessTokenSecret: ACCESS_SECRET,
  refreshTokenSecret: REFRESH_SECRET,
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
});

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
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("SessionService", () => {
  it("startSession issues an access token and a new refresh-token family", async () => {
    const user = await createUser();

    const session = await sessionService.startSession(user.id);

    const claims = verifyAccessToken(session.accessToken, ACCESS_SECRET);
    expect(claims.sub).toBe(user.id);
    expect(session.refreshToken).toEqual(expect.any(String));

    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBeNull();
  });

  it("refreshSession rotates the token and returns a new access token", async () => {
    const user = await createUser();
    const session = await sessionService.startSession(user.id);

    const refreshed = await sessionService.refreshSession(session.refreshToken);

    expect(refreshed).not.toBeNull();
    const claims = verifyAccessToken(refreshed!.accessToken, ACCESS_SECRET);
    expect(claims.sub).toBe(user.id);
    expect(refreshed!.refreshToken).not.toBe(session.refreshToken);
  });

  it("refreshSession revokes the whole family and returns null on a reused/revoked token", async () => {
    const user = await createUser();
    const session = await sessionService.startSession(user.id);
    const refreshed = await sessionService.refreshSession(session.refreshToken);
    expect(refreshed).not.toBeNull();

    // Reusing the already-rotated original token is the reuse-detection case.
    const reused = await sessionService.refreshSession(session.refreshToken);
    expect(reused).toBeNull();

    // The whole family, including the token issued by the successful refresh
    // above, must now be revoked.
    const secondRefresh = await sessionService.refreshSession(refreshed!.refreshToken);
    expect(secondRefresh).toBeNull();
  });

  it("refreshSession returns null for an unknown token", async () => {
    const result = await sessionService.refreshSession("not-a-real-token");
    expect(result).toBeNull();
  });

  it("endSession revokes only the presented token", async () => {
    const user = await createUser();
    const session = await sessionService.startSession(user.id);

    await sessionService.endSession(session.refreshToken);

    const refreshed = await sessionService.refreshSession(session.refreshToken);
    expect(refreshed).toBeNull();
  });

  it("endSession does not invalidate the access token already issued for that session", async () => {
    const user = await createUser();
    const session = await sessionService.startSession(user.id);

    await sessionService.endSession(session.refreshToken);

    expect(() => verifyAccessToken(session.accessToken, ACCESS_SECRET)).not.toThrow();
  });

  it("endSession does not affect the user's other sessions", async () => {
    const user = await createUser();
    const sessionA = await sessionService.startSession(user.id);
    const sessionB = await sessionService.startSession(user.id);

    await sessionService.endSession(sessionA.refreshToken);

    const refreshedB = await sessionService.refreshSession(sessionB.refreshToken);
    expect(refreshedB).not.toBeNull();
  });
});
