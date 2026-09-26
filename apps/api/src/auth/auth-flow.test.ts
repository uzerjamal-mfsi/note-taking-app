import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";
import { requireAuth } from "../middleware/require-auth.js";

const env = makeTestEnv();
const app = createApp(env, {
  prisma,
  extraRoutes: (expressApp) => {
    expressApp.get("/__protected-test-route", requireAuth(env.JWT_ACCESS_SECRET), (req, res) => {
      res.json({ userId: req.user?.id });
    });
  },
});

function extractCookie(response: request.Response, name: string): string {
  const setCookie = response.headers["set-cookie"];
  const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`Expected a ${name} cookie in the response`);
  }
  return cookie;
}

beforeEach(async () => {
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("full auth flow", () => {
  it("register -> login -> refresh -> reuse-detected -> re-login -> logout -> access token still valid", async () => {
    // Register
    const registerResponse = await request(app).post("/auth/register").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });
    expect(registerResponse.status).toBe(201);

    // Login (separate session/device)
    const loginResponse = await request(app).post("/auth/login").send({
      email: "ada@example.com",
      password: "supersecret",
    });
    expect(loginResponse.status).toBe(200);
    const loginCookie = extractCookie(loginResponse, "refresh_token");

    // Refresh rotates the token
    const refreshResponse = await request(app).post("/auth/refresh").set("Cookie", loginCookie);
    expect(refreshResponse.status).toBe(200);
    const rotatedCookie = extractCookie(refreshResponse, "refresh_token");
    expect(rotatedCookie).not.toBe(loginCookie);

    // Reusing the original (now-revoked) cookie is detected and rejected
    const reuseResponse = await request(app).post("/auth/refresh").set("Cookie", loginCookie);
    expect(reuseResponse.status).toBe(401);
    expect(reuseResponse.body.code).toBe("UNAUTHENTICATED");

    // Reuse detection revokes the whole family: even the token issued by the
    // legitimate refresh above is now unusable.
    const postReuseRefresh = await request(app).post("/auth/refresh").set("Cookie", rotatedCookie);
    expect(postReuseRefresh.status).toBe(401);

    // A fresh login establishes a new, independent session/family
    const secondLoginResponse = await request(app).post("/auth/login").send({
      email: "ada@example.com",
      password: "supersecret",
    });
    expect(secondLoginResponse.status).toBe(200);
    const secondCookie = extractCookie(secondLoginResponse, "refresh_token");
    const accessTokenBeforeLogout = secondLoginResponse.body.accessToken as string;

    // Logout revokes the refresh token but not the still-live access token
    const logoutResponse = await request(app).post("/auth/logout").set("Cookie", secondCookie);
    expect(logoutResponse.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/auth/refresh").set("Cookie", secondCookie);
    expect(refreshAfterLogout.status).toBe(401);

    const protectedRequest = await request(app)
      .get("/__protected-test-route")
      .set("Authorization", `Bearer ${accessTokenBeforeLogout}`);
    expect(protectedRequest.status).toBe(200);
  });
});
