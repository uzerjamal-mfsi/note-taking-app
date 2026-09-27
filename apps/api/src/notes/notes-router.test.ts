import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

// This file's pagination/tag-filter coverage issues more requests per test
// file than the default rate limit allows for; raise it for this app instance
// only (other test files keep the default 100/window).
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
      tags: [],
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

  it("creates a note associated with the given tagIds and returns them as tags", async () => {
    const { accessToken, userId } = await registerUser();
    const work = await prisma.tag.create({ data: { userId, name: "work", color: "#FF8800" } });
    const personal = await prisma.tag.create({
      data: { userId, name: "personal", color: "#00FF00" },
    });

    const response = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT, tagIds: [work.id, personal.id] });

    expect(response.status).toBe(201);
    expect(response.body.tags.map((t: { id: string }) => t.id).sort()).toEqual(
      [work.id, personal.id].sort(),
    );
  });

  it("rejects a tagId not owned by the caller with 422, and creates no note", async () => {
    const { accessToken } = await registerUser();
    const other = await registerUser();
    const othersTag = await prisma.tag.create({
      data: { userId: other.userId, name: "work", color: "#FF8800" },
    });

    const response = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT, tagIds: [othersTag.id] });

    expect(response.status).toBe(422);
    expect(await prisma.note.count()).toBe(0);
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
  async function createNote(accessToken: string, text = "Hello world") {
    return request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        },
      });
  }

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
    expect(response.body.data.map((n: { id: string }) => n.id)).toEqual([kept.body.id]);
    expect(response.body.meta.total).toBe(1);
  });

  it("applies default pagination and meta when no query params are given", async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, "Only note");

    const response = await request(app).get("/notes").set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it("returns the remaining notes on a later page", async () => {
    const { accessToken } = await registerUser();
    for (let i = 0; i < 3; i += 1) {
      await createNote(accessToken, `Note ${i}`);
    }

    const response = await request(app)
      .get("/notes?page=2&pageSize=2")
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it("returns an empty page and the correct total for a page past the end", async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken);

    const response = await request(app)
      .get("/notes?page=3&pageSize=20")
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(1);
  });

  it("sorts by createdAt ascending when requested", async () => {
    const { accessToken } = await registerUser();
    const first = await createNote(accessToken, "First");
    const second = await createNote(accessToken, "Second");

    const response = await request(app)
      .get("/notes?sortBy=createdAt&sortDir=asc")
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.map((n: { id: string }) => n.id)).toEqual([
      first.body.id,
      second.body.id,
    ]);
  });

  it("orders tied sort values deterministically and stably across requests", async () => {
    const { accessToken, userId } = await registerUser();
    const created = [];
    for (let i = 0; i < 3; i += 1) {
      created.push((await createNote(accessToken, `Note ${i}`)).body.id as string);
    }
    await prisma.note.updateMany({ where: { userId }, data: { updatedAt: new Date() } });

    const first = await request(app).get("/notes").set(authHeader(accessToken));
    const second = await request(app).get("/notes").set(authHeader(accessToken));

    const expectedOrder = [...created].sort().reverse();
    expect(first.body.data.map((n: { id: string }) => n.id)).toEqual(expectedOrder);
    expect(second.body.data.map((n: { id: string }) => n.id)).toEqual(expectedOrder);
  });

  it("filters by a single tag", async () => {
    const { accessToken, userId } = await registerUser();
    const tagged = await createNote(accessToken, "Tagged");
    await createNote(accessToken, "Untagged");
    const tag = await prisma.tag.create({ data: { userId, name: "work" } });
    await prisma.noteTag.create({ data: { noteId: tagged.body.id, tagId: tag.id } });

    const response = await request(app).get("/notes?tags=work").set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.map((n: { id: string }) => n.id)).toEqual([tagged.body.id]);
  });

  it("filters by multiple tags using OR", async () => {
    const { accessToken, userId } = await registerUser();
    const workNote = await createNote(accessToken, "Work");
    const personalNote = await createNote(accessToken, "Personal");
    await createNote(accessToken, "Neither");
    const workTag = await prisma.tag.create({ data: { userId, name: "work" } });
    const personalTag = await prisma.tag.create({ data: { userId, name: "personal" } });
    await prisma.noteTag.create({ data: { noteId: workNote.body.id, tagId: workTag.id } });
    await prisma.noteTag.create({ data: { noteId: personalNote.body.id, tagId: personalTag.id } });

    const response = await request(app)
      .get("/notes?tags=work,personal")
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.map((n: { id: string }) => n.id).sort()).toEqual(
      [workNote.body.id, personalNote.body.id].sort(),
    );
  });

  it("matches tags case-insensitively", async () => {
    const { accessToken, userId } = await registerUser();
    const note = await createNote(accessToken, "Note");
    const tag = await prisma.tag.create({ data: { userId, name: "work" } });
    await prisma.noteTag.create({ data: { noteId: note.body.id, tagId: tag.id } });

    const response = await request(app).get("/notes?tags=Work").set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.map((n: { id: string }) => n.id)).toEqual([note.body.id]);
  });

  it("trims tag names and drops blank entries", async () => {
    const { accessToken, userId } = await registerUser();
    const workNote = await createNote(accessToken, "Work");
    const personalNote = await createNote(accessToken, "Personal");
    const workTag = await prisma.tag.create({ data: { userId, name: "work" } });
    const personalTag = await prisma.tag.create({ data: { userId, name: "personal" } });
    await prisma.noteTag.create({ data: { noteId: workNote.body.id, tagId: workTag.id } });
    await prisma.noteTag.create({ data: { noteId: personalNote.body.id, tagId: personalTag.id } });

    const response = await request(app)
      .get("/notes?tags=%20work%20,,personal")
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.map((n: { id: string }) => n.id).sort()).toEqual(
      [workNote.body.id, personalNote.body.id].sort(),
    );
  });

  it("returns an empty page when no note has the requested tag", async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken);

    const response = await request(app).get("/notes?tags=nonexistent").set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  it("rejects pageSize above 100 with 422, without querying notes", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app).get("/notes?pageSize=101").set(authHeader(accessToken));

    expect(response.status).toBe(422);
  });

  it("rejects an invalid sortBy with 422", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app).get("/notes?sortBy=title").set(authHeader(accessToken));

    expect(response.status).toBe(422);
  });

  it("rejects more than 10 tags with 422", async () => {
    const { accessToken } = await registerUser();
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`).join(",");

    const response = await request(app).get(`/notes?tags=${tags}`).set(authHeader(accessToken));

    expect(response.status).toBe(422);
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

  it("replaces the note's tags with the given tagIds", async () => {
    const { accessToken, userId } = await registerUser();
    const work = await prisma.tag.create({ data: { userId, name: "work", color: "#FF8800" } });
    const personal = await prisma.tag.create({
      data: { userId, name: "personal", color: "#00FF00" },
    });
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT, tagIds: [work.id] });

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ content: CONTENT, tagIds: [personal.id] });

    expect(response.status).toBe(200);
    expect(response.body.tags.map((t: { id: string }) => t.id)).toEqual([personal.id]);
  });

  it("leaves the note's tags unchanged when tagIds is omitted", async () => {
    const { accessToken, userId } = await registerUser();
    const work = await prisma.tag.create({ data: { userId, name: "work", color: "#FF8800" } });
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT, tagIds: [work.id] });
    const nextContent = { type: "doc", content: [{ type: "text", text: "Updated" }] };

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ content: nextContent });

    expect(response.status).toBe(200);
    expect(response.body.tags.map((t: { id: string }) => t.id)).toEqual([work.id]);
  });

  it("rejects a tagId not owned by the caller with 422, and does not modify the note", async () => {
    const { accessToken } = await registerUser();
    const other = await registerUser();
    const othersTag = await prisma.tag.create({
      data: { userId: other.userId, name: "work", color: "#FF8800" },
    });
    const created = await request(app)
      .post("/notes")
      .set(authHeader(accessToken))
      .send({ content: CONTENT });

    const response = await request(app)
      .patch(`/notes/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ content: CONTENT, tagIds: [othersTag.id] });

    expect(response.status).toBe(422);
    const row = await prisma.note.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.title).toBe(created.body.title);
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
