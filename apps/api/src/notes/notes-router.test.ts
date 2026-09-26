import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

const env = makeTestEnv();
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

beforeEach(async () => {
  await prisma.note.deleteMany();
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /notes", () => {
  it("creates a note and responds 201 with a server-derived title", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      title: "Hello world",
      content: CONTENT,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("rejects missing/empty content with 422", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: { type: "doc", content: [] } });

    expect(response.status).toBe(422);
    expect(await prisma.note.count()).toBe(0);
  });

  it("rejects content nested beyond MAX_CONTENT_DEPTH with 422", async () => {
    const { accessToken } = await registerUser();
    let node: Record<string, unknown> = { type: "text", text: "leaf" };
    for (let i = 0; i < 60; i += 1) {
      node = { type: "node", content: [node] };
    }

    const response = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: { type: "doc", content: [node] } });

    expect(response.status).toBe(422);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).post("/notes").send({ content: CONTENT });

    expect(response.status).toBe(401);
  });
});

describe("GET /notes/:id", () => {
  it("returns the note when the caller owns it", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });

    const response = await request(app)
      .get(`/notes/${created.body.id}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
  });

  it("returns 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(owner.accessToken))
      .send({ content: CONTENT });

    const response = await request(app)
      .get(`/notes/${created.body.id}`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
  });

  it("returns 404 for a nonexistent note", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app).get(`/notes/${randomUUID()}`).set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("returns 404 (not a validation error) for a malformed, non-UUID id", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app).get("/notes/not-a-real-id").set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("returns 404 for an already-deleted note", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });
    await request(app).delete(`/notes/${created.body.id}`).set(authHeader(accessToken));

    const response = await request(app)
      .get(`/notes/${created.body.id}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).get(`/notes/${randomUUID()}`);

    expect(response.status).toBe(401);
  });
});

describe("GET /notes", () => {
  it("lists only the caller's non-deleted notes", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const kept = await request(app)
      .post("/notes")
      .set(authHeader(owner.accessToken))
      .send({ content: CONTENT });
    const toDelete = await request(app)
      .post("/notes")
      .set(authHeader(owner.accessToken))
      .send({ content: CONTENT });
    await request(app).post("/notes").set(authHeader(other.accessToken)).send({ content: CONTENT });
    await request(app).delete(`/notes/${toDelete.body.id}`).set(authHeader(owner.accessToken));

    const response = await request(app).get("/notes").set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.map((n: { id: string }) => n.id)).toEqual([kept.body.id]);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).get("/notes");

    expect(response.status).toBe(401);
  });
});

describe("PATCH /notes/:id", () => {
  it("replaces content, re-derives title, and responds 200", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });
    const nextContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Updated title" }] }],
    };

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ content: nextContent });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Updated title");
    expect(response.body.content).toEqual(nextContent);
  });

  it("rejects missing/empty content with 422", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ content: { type: "doc", content: [] } });

    expect(response.status).toBe(422);
  });

  it("rejects content nested beyond MAX_CONTENT_DEPTH with 422", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });
    let node: Record<string, unknown> = { type: "text", text: "leaf" };
    for (let i = 0; i < 60; i += 1) {
      node = { type: "node", content: [node] };
    }

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ content: { type: "doc", content: [node] } });

    expect(response.status).toBe(422);
  });

  it("returns 404 for another user's note, and does not modify it", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(owner.accessToken))
      .send({ content: CONTENT });

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(other.accessToken))
      .send({ content: { type: "doc", content: [{ type: "text", text: "hacked" }] } });

    expect(response.status).toBe(404);
    const row = await prisma.note.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.title).not.toBe("hacked");
  });

  it("returns 404 for an already-deleted note", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });
    await request(app).delete(`/notes/${created.body.id}`).set(authHeader(accessToken));

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ content: CONTENT });

    expect(response.status).toBe(404);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).patch(`/notes/${randomUUID()}`).send({ content: CONTENT });

    expect(response.status).toBe(401);
  });
});

describe("DELETE /notes/:id", () => {
  it("soft-deletes the note and responds 204 with an empty body", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });

    const response = await request(app)
      .delete(`/notes/${created.body.id}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    const row = await prisma.note.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.deletedAt).not.toBeNull();
  });

  it("returns 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(owner.accessToken))
      .send({ content: CONTENT });

    const response = await request(app)
      .delete(`/notes/${created.body.id}`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
  });

  it("returns 404 for an already-deleted note", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });
    await request(app).delete(`/notes/${created.body.id}`).set(authHeader(accessToken));

    const response = await request(app)
      .delete(`/notes/${created.body.id}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).delete(`/notes/${randomUUID()}`);

    expect(response.status).toBe(401);
  });
});
