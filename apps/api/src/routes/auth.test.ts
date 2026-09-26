import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

const env = makeTestEnv();
const app = createApp(env, { prisma });

const REGISTER_URL = "/auth/register";
const LOGIN_URL = "/auth/login";
const REFRESH_URL = "/auth/refresh";
const LOGOUT_URL = "/auth/logout";

function extractCookie(response: request.Response, name: string): string | undefined {
  const setCookie = response.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`));
}

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /auth/register", () => {
  it("creates a user, returns 201 with an access token, and sets a refresh cookie", async () => {
    const response = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({
      id: expect.any(String),
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(/refresh/i);

    const cookie = extractCookie(response, "refresh_token");
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/auth/i);
  });

  it("rejects a duplicate email with 409 and creates no second user", async () => {
    await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });

    const response = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace Two",
      email: "ada@example.com",
      password: "supersecret",
    });

    expect(response.status).toBe(409);
    const users = await prisma.user.findMany({ where: { email: "ada@example.com" } });
    expect(users).toHaveLength(1);
  });

  it("rejects a duplicate email that only differs by case/whitespace", async () => {
    await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });

    const response = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace Two",
      email: "  Ada@Example.com  ",
      password: "supersecret",
    });

    expect(response.status).toBe(409);
  });

  it("rejects an invalid body with 422", async () => {
    const response = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "not-an-email",
      password: "short",
    });

    expect(response.status).toBe(422);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });
  });

  it("returns 200 with an access token and a refresh cookie for correct credentials", async () => {
    const response = await request(app).post(LOGIN_URL).send({
      email: "ada@example.com",
      password: "supersecret",
    });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(extractCookie(response, "refresh_token")).toBeDefined();
  });

  it("returns a generic 401 for a wrong password", async () => {
    const response = await request(app).post(LOGIN_URL).send({
      email: "ada@example.com",
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the same generic 401 for an unknown email", async () => {
    const response = await request(app).post(LOGIN_URL).send({
      email: "unknown@example.com",
      password: "supersecret",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an invalid body with 422", async () => {
    const response = await request(app).post(LOGIN_URL).send({ email: "ada@example.com" });

    expect(response.status).toBe(422);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates a valid refresh cookie into a new access token and cookie", async () => {
    const registerResponse = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });
    const cookie = extractCookie(registerResponse, "refresh_token")!;

    const response = await request(app).post(REFRESH_URL).set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    const newCookie = extractCookie(response, "refresh_token");
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(cookie);
  });

  it("returns 401 UNAUTHENTICATED when the same cookie is presented twice (reuse)", async () => {
    const registerResponse = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });
    const cookie = extractCookie(registerResponse, "refresh_token")!;

    await request(app).post(REFRESH_URL).set("Cookie", cookie);
    const reused = await request(app).post(REFRESH_URL).set("Cookie", cookie);

    expect(reused.status).toBe(401);
    expect(reused.body.code).toBe("UNAUTHENTICATED");
  });

  it("returns 401 UNAUTHENTICATED with no refresh cookie", async () => {
    const response = await request(app).post(REFRESH_URL);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /auth/logout", () => {
  it("revokes the session, clears the cookie, and returns 204", async () => {
    const registerResponse = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });
    const cookie = extractCookie(registerResponse, "refresh_token")!;

    const response = await request(app).post(LOGOUT_URL).set("Cookie", cookie);

    expect(response.status).toBe(204);
    const cleared = extractCookie(response, "refresh_token");
    expect(cleared).toMatch(/refresh_token=;/);
  });

  it("the revoked refresh token subsequently fails at /auth/refresh", async () => {
    const registerResponse = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });
    const cookie = extractCookie(registerResponse, "refresh_token")!;

    await request(app).post(LOGOUT_URL).set("Cookie", cookie);
    const refreshAttempt = await request(app).post(REFRESH_URL).set("Cookie", cookie);

    expect(refreshAttempt.status).toBe(401);
  });

  it("returns 401 with no refresh cookie", async () => {
    const response = await request(app).post(LOGOUT_URL);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHENTICATED");
  });
});

describe("rate limiting on /auth", () => {
  it("subjects /auth/login to the existing global rate limiter", async () => {
    const limitedEnv = makeTestEnv({ RATE_LIMIT_MAX: 2 });
    const limitedApp = createApp(limitedEnv, { prisma });

    await request(limitedApp).post(LOGIN_URL).send({ email: "a@b.com", password: "x" });
    await request(limitedApp).post(LOGIN_URL).send({ email: "a@b.com", password: "x" });
    const response = await request(limitedApp)
      .post(LOGIN_URL)
      .send({ email: "a@b.com", password: "x" });

    expect(response.status).toBe(429);
  });
});
