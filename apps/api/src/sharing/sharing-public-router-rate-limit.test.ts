import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

// A generous global limit but a tiny share-specific one, so only the
// route's own limiter can be the one that trips.
const env = makeTestEnv({ RATE_LIMIT_MAX: 1000, SHARE_RATE_LIMIT_MAX: 3 });
const app = createApp(env, { prisma });

const CONTENT = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
};

async function registerUser() {
  const email = `user-${randomUUID()}@example.com`;
  const response = await request(app).post("/auth/register").send({
    name: "Test User",
    email,
    password: "supersecret",
  });
  return { accessToken: response.body.accessToken as string };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
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

describe("GET /shared/:token rate limiting", () => {
  it("rejects requests once this route's own limit is exceeded, without changing viewCount", async () => {
    const { accessToken } = await registerUser();
    const noteResponse = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });
    const noteId = noteResponse.body.id as string;
    const shareResponse = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({});
    const token = shareResponse.body.token as string;

    for (let i = 0; i < 3; i += 1) {
      const ok = await request(app).get(`/shared/${token}`);
      expect(ok.status).toBe(200);
    }

    const limited = await request(app).get(`/shared/${token}`);
    expect(limited.status).toBe(429);

    const row = await prisma.sharedNote.findUnique({ where: { token } });
    expect(row?.viewCount).toBe(3);
  });
});
