import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

// This file issues more requests per test than the default share rate limit
// allows; raise it for this app instance only (5.2 covers the 429 behavior
// with a small limit in its own app instance).
const env = makeTestEnv({ RATE_LIMIT_MAX: 1000, SHARE_RATE_LIMIT_MAX: 1000 });
const app = createApp(env, { prisma });

const CONTENT = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
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

async function createNote(accessToken: string) {
  const response = await request(app)
    .post("/notes")
    .set(authHeader(accessToken))
    .send({ content: CONTENT });
  return response.body.id as string;
}

async function shareNote(accessToken: string, noteId: string) {
  const response = await request(app)
    .post(`/notes/${noteId}/share`)
    .set(authHeader(accessToken))
    .send({});
  return response.body.token as string;
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

describe("GET /shared/:token", () => {
  it("returns only title and content, and increments viewCount", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const token = await shareNote(accessToken, noteId);

    const response = await request(app).get(`/shared/${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ title: "Hello world", content: CONTENT });
    const row = await prisma.sharedNote.findUnique({ where: { token } });
    expect(row?.viewCount).toBe(1);
  });

  it("increments viewCount by exactly 1 per request", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const token = await shareNote(accessToken, noteId);

    await request(app).get(`/shared/${token}`);
    await request(app).get(`/shared/${token}`);
    await request(app).get(`/shared/${token}`);

    const row = await prisma.sharedNote.findUnique({ where: { token } });
    expect(row?.viewCount).toBe(3);
  });

  it("responds 404 for an unknown token", async () => {
    const response = await request(app).get(`/shared/${randomUUID()}`);

    expect(response.status).toBe(404);
  });

  it("responds 404 and doesn't change viewCount for a revoked token", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const token = await shareNote(accessToken, noteId);
    await request(app).delete(`/notes/${noteId}/share`).set(authHeader(accessToken));

    const response = await request(app).get(`/shared/${token}`);

    expect(response.status).toBe(404);
  });

  it("responds 404 and doesn't change viewCount for an expired token", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const token = "expired-token";
    await prisma.sharedNote.create({
      data: { noteId, token, expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app).get(`/shared/${token}`);

    expect(response.status).toBe(404);
    const row = await prisma.sharedNote.findUnique({ where: { token } });
    expect(row?.viewCount).toBe(0);
  });

  it("responds 404 and doesn't change viewCount when the note was soft-deleted directly at the DB layer", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const token = await shareNote(accessToken, noteId);
    // Bypass NotesService.deleteNote's cascade to prove the public read path
    // has its own independent guard against a soft-deleted note.
    await prisma.note.update({ where: { id: noteId }, data: { deletedAt: new Date() } });

    const response = await request(app).get(`/shared/${token}`);

    expect(response.status).toBe(404);
    const row = await prisma.sharedNote.findUnique({ where: { token } });
    expect(row?.viewCount).toBe(0);
  });

  it("responds 404 for a token whose note was soft-deleted through the normal delete endpoint", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const token = await shareNote(accessToken, noteId);
    await request(app).delete(`/notes/${noteId}`).set(authHeader(accessToken));

    const response = await request(app).get(`/shared/${token}`);

    expect(response.status).toBe(404);
  });
});
