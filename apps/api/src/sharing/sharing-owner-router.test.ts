import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

const env = makeTestEnv({ RATE_LIMIT_MAX: 1000 });
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
  return {
    accessToken: response.body.accessToken as string,
    userId: response.body.user.id as string,
  };
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

describe("POST /notes/:id/share", () => {
  it("creates a new link with viewCount 0 and expiresAt null", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const response = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({});

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      token: expect.any(String),
      viewCount: 0,
      expiresAt: null,
      createdAt: expect.any(String),
    });
  });

  it("creates a new link with the supplied future expiresAt", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const response = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({ expiresAt });

    expect(response.status).toBe(201);
    expect(response.body.expiresAt).toBe(expiresAt);
  });

  it("replaces an expired link with a fresh one", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await prisma.sharedNote.create({
      data: { noteId, token: "expired-token", expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({});

    expect(response.status).toBe(201);
    expect(response.body.token).not.toBe("expired-token");
    expect(response.body.viewCount).toBe(0);
    const oldTokenResponse = await request(app).get("/shared/expired-token");
    expect(oldTokenResponse.status).toBe(404);
  });

  it("rejects an expiresAt that is not strictly in the future with 422", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const response = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({ expiresAt: new Date(Date.now() - 1000).toISOString() });

    expect(response.status).toBe(422);
    expect(await prisma.sharedNote.count()).toBe(0);
  });

  it("returns the existing link unchanged on a second call (idempotent)", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const first = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({});

    const second = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({ expiresAt: new Date(Date.now() + 3600_000).toISOString() });

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it("responds 404 when the note does not exist", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app)
      .post(`/notes/${randomUUID()}/share`)
      .set(authHeader(accessToken))
      .send({});

    expect(response.status).toBe(404);
  });

  it("responds 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const noteId = await createNote(owner.accessToken);

    const response = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(other.accessToken))
      .send({});

    expect(response.status).toBe(404);
  });

  it("responds 401 when unauthenticated", async () => {
    const response = await request(app).post(`/notes/${randomUUID()}/share`).send({});

    expect(response.status).toBe(401);
  });
});

describe("GET /notes/:id/share", () => {
  it("returns the active link", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const created = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({});

    const response = await request(app).get(`/notes/${noteId}/share`).set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
  });

  it("responds 404 when there is no active share link", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const response = await request(app).get(`/notes/${noteId}/share`).set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 when the only share link has expired", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await prisma.sharedNote.create({
      data: { noteId, token: "expired-token", expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app).get(`/notes/${noteId}/share`).set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const noteId = await createNote(owner.accessToken);

    const response = await request(app)
      .get(`/notes/${noteId}/share`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 401 when unauthenticated", async () => {
    const response = await request(app).get(`/notes/${randomUUID()}/share`);

    expect(response.status).toBe(401);
  });
});

describe("DELETE /notes/:id/share", () => {
  it("revokes an active link and responds 204", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const shared = await request(app)
      .post(`/notes/${noteId}/share`)
      .set(authHeader(accessToken))
      .send({});
    const token = shared.body.token as string;

    const response = await request(app)
      .delete(`/notes/${noteId}/share`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(204);
    expect(await prisma.sharedNote.count({ where: { noteId } })).toBe(0);
    const oldTokenResponse = await request(app).get(`/shared/${token}`);
    expect(oldTokenResponse.status).toBe(404);
  });

  it("responds 404 when there is no active share link", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const response = await request(app)
      .delete(`/notes/${noteId}/share`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 and changes nothing when the only share link has expired", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await prisma.sharedNote.create({
      data: { noteId, token: "expired-token", expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .delete(`/notes/${noteId}/share`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
    expect(await prisma.sharedNote.count({ where: { noteId } })).toBe(1);
  });

  it("responds 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const noteId = await createNote(owner.accessToken);
    await request(app).post(`/notes/${noteId}/share`).set(authHeader(owner.accessToken)).send({});

    const response = await request(app)
      .delete(`/notes/${noteId}/share`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 401 when unauthenticated", async () => {
    const response = await request(app).delete(`/notes/${randomUUID()}/share`);

    expect(response.status).toBe(401);
  });
});
