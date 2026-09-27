import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

const env = makeTestEnv();
const app = createApp(env, { prisma });

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

async function createNote(userId: string) {
  return prisma.note.create({
    data: {
      userId,
      title: "Hello",
      content: { type: "doc", content: [{ type: "text", text: "Hi" }] },
    },
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

describe("POST /tags", () => {
  it("creates a tag and responds 201 with noteCount 0 and uppercase color", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#ff8800" });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      name: "Work",
      color: "#FF8800",
      createdAt: expect.any(String),
      noteCount: 0,
    });
  });

  it("rejects a missing/blank/over-length name with 422", async () => {
    const { accessToken } = await registerUser();

    for (const name of [undefined, "   ", "a".repeat(101)]) {
      const response = await request(app)
        .post("/tags")
        .set(authHeader(accessToken))
        .send({ name, color: "#FF8800" });

      expect(response.status).toBe(422);
    }
    expect(await prisma.tag.count()).toBe(0);
  });

  it("rejects a missing/invalid color with 422", async () => {
    const { accessToken } = await registerUser();

    for (const color of [undefined, "FF8800", "not-a-color"]) {
      const response = await request(app)
        .post("/tags")
        .set(authHeader(accessToken))
        .send({ name: "Work", color });

      expect(response.status).toBe(422);
    }
  });

  it("rejects a duplicate name (case-insensitive) with 409", async () => {
    const { accessToken } = await registerUser();
    await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });

    const response = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "work", color: "#00FF00" });

    expect(response.status).toBe(409);
    expect(await prisma.tag.count()).toBe(1);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).post("/tags").send({ name: "Work", color: "#FF8800" });

    expect(response.status).toBe(401);
  });
});

describe("GET /tags", () => {
  it("lists only the caller's tags, each with noteCount excluding soft-deleted notes", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const busy = await request(app)
      .post("/tags")
      .set(authHeader(owner.accessToken))
      .send({ name: "Work", color: "#FF8800" });
    const idle = await request(app)
      .post("/tags")
      .set(authHeader(owner.accessToken))
      .send({ name: "Personal", color: "#00FF00" });
    await request(app)
      .post("/tags")
      .set(authHeader(other.accessToken))
      .send({ name: "Other", color: "#0000FF" });

    const activeNote = await createNote(owner.userId);
    const deletedNote = await createNote(owner.userId);
    await prisma.noteTag.create({ data: { noteId: activeNote.id, tagId: busy.body.id } });
    await prisma.noteTag.create({ data: { noteId: deletedNote.id, tagId: busy.body.id } });
    await prisma.note.update({ where: { id: deletedNote.id }, data: { deletedAt: new Date() } });

    const response = await request(app).get("/tags").set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    const byId = Object.fromEntries(
      (response.body as Array<{ id: string; noteCount: number }>).map((t) => [t.id, t.noteCount]),
    );
    expect(byId[busy.body.id]).toBe(1);
    expect(byId[idle.body.id]).toBe(0);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).get("/tags");

    expect(response.status).toBe(401);
  });
});

describe("PATCH /tags/:id", () => {
  it("renames and recolors a tag and responds 200", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });

    const response = await request(app)
      .patch(`/tags/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ name: "Job", color: "#00ff00" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Job");
    expect(response.body.color).toBe("#00FF00");
  });

  it("rejects an invalid name or color with 422", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });

    const response = await request(app)
      .patch(`/tags/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({ color: "not-a-color" });

    expect(response.status).toBe(422);
  });

  it("rejects an empty body with 422", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });

    const response = await request(app)
      .patch(`/tags/${created.body.id}`)
      .set(authHeader(accessToken))
      .send({});

    expect(response.status).toBe(422);
  });

  it("rejects a duplicate name (case-insensitive) with 409", async () => {
    const { accessToken } = await registerUser();
    await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });
    const other = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Personal", color: "#00FF00" });

    const response = await request(app)
      .patch(`/tags/${other.body.id}`)
      .set(authHeader(accessToken))
      .send({ name: "work" });

    expect(response.status).toBe(409);
  });

  it("returns 404 for another user's tag, and does not modify it", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(owner.accessToken))
      .send({ name: "Work", color: "#FF8800" });

    const response = await request(app)
      .patch(`/tags/${created.body.id}`)
      .set(authHeader(other.accessToken))
      .send({ name: "Hacked" });

    expect(response.status).toBe(404);
    const row = await prisma.tag.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.name).toBe("Work");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).patch(`/tags/${randomUUID()}`).send({ name: "Job" });

    expect(response.status).toBe(401);
  });
});

describe("DELETE /tags/:id", () => {
  it("deletes an unused tag and responds 204", async () => {
    const { accessToken } = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });

    const response = await request(app)
      .delete(`/tags/${created.body.id}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(await prisma.tag.findUnique({ where: { id: created.body.id } })).toBeNull();
  });

  it("blocks deletion with 409 while a non-deleted note carries the tag", async () => {
    const { accessToken, userId } = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });
    const note = await createNote(userId);
    await prisma.noteTag.create({ data: { noteId: note.id, tagId: created.body.id } });

    const response = await request(app)
      .delete(`/tags/${created.body.id}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(409);
    expect(await prisma.tag.findUnique({ where: { id: created.body.id } })).not.toBeNull();
  });

  it("deletes a tag carried only by soft-deleted notes, responding 204", async () => {
    const { accessToken, userId } = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(accessToken))
      .send({ name: "Work", color: "#FF8800" });
    const note = await createNote(userId);
    await prisma.noteTag.create({ data: { noteId: note.id, tagId: created.body.id } });
    await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });

    const response = await request(app)
      .delete(`/tags/${created.body.id}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(204);
  });

  it("returns 404 for another user's tag, and does not delete it", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await request(app)
      .post("/tags")
      .set(authHeader(owner.accessToken))
      .send({ name: "Work", color: "#FF8800" });

    const response = await request(app)
      .delete(`/tags/${created.body.id}`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
    expect(await prisma.tag.findUnique({ where: { id: created.body.id } })).not.toBeNull();
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).delete(`/tags/${randomUUID()}`);

    expect(response.status).toBe(401);
  });
});
