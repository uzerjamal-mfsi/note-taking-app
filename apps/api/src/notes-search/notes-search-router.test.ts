import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

const env = makeTestEnv({ RATE_LIMIT_MAX: 1000 });
const app = createApp(env, { prisma });

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

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

function docWithText(text: string) {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

async function createNote(accessToken: string, text: string) {
  return request(app)
    .post("/notes")
    .set(authHeader(accessToken))
    .send({ content: docWithText(text) });
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

describe("GET /notes/search", () => {
  it("returns matching notes with the expected envelope shape", async () => {
    const { accessToken } = await registerUser();
    const created = await createNote(accessToken, "Grocery list eggs and milk");

    const response = await request(app).get("/notes/search?q=grocery").set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        {
          id: created.body.id,
          title: expect.any(String),
          titleMatches: expect.any(Array),
          snippet: expect.any(String),
          snippetMatches: expect.any(Array),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          tags: [],
        },
      ],
      meta: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it("is not shadowed by GET /notes/:id — reaches the search handler, not the note-detail handler", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app)
      .get("/notes/search?q=anything")
      .set(authHeader(accessToken));

    // If `:id` had captured "search", this would be a 404 (not-a-uuid lookup
    // miss), not a validated search response.
    expect(response.status).not.toBe(404);
    expect(response.body).toHaveProperty("data");
    expect(response.body).toHaveProperty("meta");
  });

  it("rejects a missing q with 422", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app).get("/notes/search").set(authHeader(accessToken));

    expect(response.status).toBe(422);
  });

  it("rejects a blank q with 422", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app).get("/notes/search?q=%20%20").set(authHeader(accessToken));

    expect(response.status).toBe(422);
  });

  it("rejects a q longer than 200 characters with 422", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app)
      .get(`/notes/search?q=${"a".repeat(201)}`)
      .set(authHeader(accessToken));

    expect(response.status).toBe(422);
  });

  it("rejects pageSize above 100 with 422", async () => {
    const { accessToken } = await registerUser();

    const response = await request(app)
      .get("/notes/search?q=note&pageSize=101")
      .set(authHeader(accessToken));

    expect(response.status).toBe(422);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await request(app).get("/notes/search?q=grocery");

    expect(response.status).toBe(401);
  });

  it("returns an empty page for a query with no searchable terms, not an error", async () => {
    const { accessToken } = await registerUser();
    await createNote(accessToken, "the a an");

    const response = await request(app).get("/notes/search?q=the").set(authHeader(accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  it("returns literal markup-like text unescaped and unmodified, with no additional markup inserted", async () => {
    // Postgres's default text search parser treats "<script>...</script>"
    // itself as an ignored "tag" token, so the query term is placed as a
    // separate plain word to guarantee a match while the literal tag text
    // still appears verbatim in the returned snippet.
    const { accessToken } = await registerUser();
    await createNote(accessToken, "budget script: <script>alert('hi')</script> in the body");

    const response = await request(app).get("/notes/search?q=script").set(authHeader(accessToken));

    expect(response.status).toBe(200);
    const [result] = response.body.data;
    expect(result.snippet).toContain("<script>alert('hi')</script>");
    expect(result.snippet.includes("\u0001") || result.snippet.includes("\u0002")).toBe(false);
  });

  it("excludes another user's notes and the caller's soft-deleted notes", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const kept = await createNote(owner.accessToken, "Budget plan");
    const deleted = await createNote(owner.accessToken, "Budget archive");
    await request(app).delete(`/notes/${deleted.body.id}`).set(authHeader(owner.accessToken));
    await createNote(other.accessToken, "Budget (other user)");

    const response = await request(app)
      .get("/notes/search?q=budget")
      .set(authHeader(owner.accessToken));

    expect(response.status).toBe(200);
    expect(response.body.data.map((r: { id: string }) => r.id)).toEqual([kept.body.id]);
  });
});
