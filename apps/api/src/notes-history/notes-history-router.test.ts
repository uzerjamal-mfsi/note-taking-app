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
const UPDATED_CONTENT = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Updated content" }] }],
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

async function updateNote(accessToken: string, noteId: string, content: unknown) {
  return request(app).patch(`/notes/${noteId}`).set(authHeader(accessToken)).send({ content });
}

beforeEach(async () => {
  await prisma.noteVersion.deleteMany();
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

describe("GET /notes/:id/versions", () => {
  it("lists versions most-recently-created first, with metadata only (no content)", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await updateNote(accessToken, noteId, UPDATED_CONTENT);

    const response = await request(app)
      .get(`/notes/${noteId}/versions`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: expect.any(String),
        noteId,
        title: "Hello world",
        createdAt: expect.any(String),
      },
    ]);
    expect(response.body[0]).not.toHaveProperty("content");
  });

  it("returns an empty list for a note that has never been updated", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const response = await request(app)
      .get(`/notes/${noteId}/versions`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("responds 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const noteId = await createNote(owner.accessToken);

    const response = await request(app)
      .get(`/notes/${noteId}/versions`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 for a soft-deleted note", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await updateNote(accessToken, noteId, UPDATED_CONTENT);
    await request(app).delete(`/notes/${noteId}`).set(authHeader(accessToken));

    const response = await request(app)
      .get(`/notes/${noteId}/versions`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 401 when unauthenticated", async () => {
    const response = await request(app).get(`/notes/${randomUUID()}/versions`);

    expect(response.status).toBe(401);
  });
});

describe("GET /notes/:id/versions/:versionId", () => {
  it("returns the version's metadata and content", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await updateNote(accessToken, noteId, UPDATED_CONTENT);
    const versionId = (
      await request(app).get(`/notes/${noteId}/versions`).set(authHeader(accessToken))
    ).body[0].id as string;

    const response = await request(app)
      .get(`/notes/${noteId}/versions/${versionId}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: versionId,
      noteId,
      title: "Hello world",
      createdAt: expect.any(String),
      content: CONTENT,
    });
  });

  it("responds 404 when versionId does not exist", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const response = await request(app)
      .get(`/notes/${noteId}/versions/${randomUUID()}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 when versionId exists but belongs to a different note", async () => {
    const { accessToken } = await registerUser();
    const noteA = await createNote(accessToken);
    const noteB = await createNote(accessToken);
    await updateNote(accessToken, noteA, UPDATED_CONTENT);
    const versionOfA = (
      await request(app).get(`/notes/${noteA}/versions`).set(authHeader(accessToken))
    ).body[0].id as string;

    const response = await request(app)
      .get(`/notes/${noteB}/versions/${versionOfA}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const noteId = await createNote(owner.accessToken);
    await updateNote(owner.accessToken, noteId, UPDATED_CONTENT);
    const versionId = (
      await request(app).get(`/notes/${noteId}/versions`).set(authHeader(owner.accessToken))
    ).body[0].id as string;

    const response = await request(app)
      .get(`/notes/${noteId}/versions/${versionId}`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 for a soft-deleted note", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await updateNote(accessToken, noteId, UPDATED_CONTENT);
    const versionId = (
      await request(app).get(`/notes/${noteId}/versions`).set(authHeader(accessToken))
    ).body[0].id as string;
    await request(app).delete(`/notes/${noteId}`).set(authHeader(accessToken));

    const response = await request(app)
      .get(`/notes/${noteId}/versions/${versionId}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 401 when unauthenticated", async () => {
    const response = await request(app).get(`/notes/${randomUUID()}/versions/${randomUUID()}`);

    expect(response.status).toBe(401);
  });
});

describe("POST /notes/:id/versions/:versionId/restore", () => {
  it("restores the version's content and returns 200 with the same Note DTO shape PATCH returns", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    const patchResponse = await updateNote(accessToken, noteId, UPDATED_CONTENT);
    const versionId = (
      await request(app).get(`/notes/${noteId}/versions`).set(authHeader(accessToken))
    ).body[0].id as string;

    const response = await request(app)
      .post(`/notes/${noteId}/versions/${versionId}/restore`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(Object.keys(patchResponse.body).sort());
    expect(response.body.content).toEqual(CONTENT);
    expect(response.body.title).toBe("Hello world");
  });

  it("restore itself creates a new version capturing the note's pre-restore content", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await updateNote(accessToken, noteId, UPDATED_CONTENT);
    const versionId = (
      await request(app).get(`/notes/${noteId}/versions`).set(authHeader(accessToken))
    ).body[0].id as string;

    await request(app)
      .post(`/notes/${noteId}/versions/${versionId}/restore`)
      .set(authHeader(accessToken));

    const versions = await request(app)
      .get(`/notes/${noteId}/versions`)
      .set(authHeader(accessToken));
    expect(versions.body).toHaveLength(2);
    expect(versions.body.map((v: { title: string }) => v.title).sort()).toEqual(
      ["Hello world", "Updated content"].sort(),
    );
  });

  it("responds 404 when versionId does not exist", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);

    const response = await request(app)
      .post(`/notes/${noteId}/versions/${randomUUID()}/restore`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 when versionId exists but belongs to a different note, and does not modify either note", async () => {
    const { accessToken } = await registerUser();
    const noteA = await createNote(accessToken);
    const noteB = await createNote(accessToken);
    await updateNote(accessToken, noteA, UPDATED_CONTENT);
    const versionOfA = (
      await request(app).get(`/notes/${noteA}/versions`).set(authHeader(accessToken))
    ).body[0].id as string;

    const response = await request(app)
      .post(`/notes/${noteB}/versions/${versionOfA}/restore`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
    const noteBAfter = await request(app).get(`/notes/${noteB}`).set(authHeader(accessToken));
    expect(noteBAfter.body.content).toEqual(CONTENT);
  });

  it("responds 404 for another user's note", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const noteId = await createNote(owner.accessToken);
    await updateNote(owner.accessToken, noteId, UPDATED_CONTENT);
    const versionId = (
      await request(app).get(`/notes/${noteId}/versions`).set(authHeader(owner.accessToken))
    ).body[0].id as string;

    const response = await request(app)
      .post(`/notes/${noteId}/versions/${versionId}/restore`)
      .set(authHeader(other.accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 404 for a soft-deleted note", async () => {
    const { accessToken } = await registerUser();
    const noteId = await createNote(accessToken);
    await updateNote(accessToken, noteId, UPDATED_CONTENT);
    const versionId = (
      await request(app).get(`/notes/${noteId}/versions`).set(authHeader(accessToken))
    ).body[0].id as string;
    await request(app).delete(`/notes/${noteId}`).set(authHeader(accessToken));

    const response = await request(app)
      .post(`/notes/${noteId}/versions/${versionId}/restore`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(404);
  });

  it("responds 401 when unauthenticated", async () => {
    const response = await request(app).post(
      `/notes/${randomUUID()}/versions/${randomUUID()}/restore`,
    );

    expect(response.status).toBe(401);
  });
});
