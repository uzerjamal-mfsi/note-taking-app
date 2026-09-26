import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

const env = makeTestEnv();
const app = createApp(env, { prisma });

const REGISTER_URL = "/auth/register";
const LOGIN_URL = "/auth/login";
const FORGOT_PASSWORD_URL = "/auth/forgot-password";
const RESET_PASSWORD_URL = "/auth/reset-password";

beforeEach(async () => {
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function registerAndRequestOtp(email: string): Promise<string> {
  await request(app).post(REGISTER_URL).send({
    name: "Ada Lovelace",
    email,
    password: "supersecret",
  });

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await request(app).post(FORGOT_PASSWORD_URL).send({ email });
  const logged = logSpy.mock.calls.flat().join(" ");
  logSpy.mockRestore();

  const match = logged.match(/\b(\d{6})\b/);
  const otp = match?.[1];
  if (!otp) {
    throw new Error("Expected an OTP to be logged");
  }
  return otp;
}

describe("POST /auth/reset-password", () => {
  it("resets the password and the new password can be used to log in", async () => {
    const email = "ada@example.com";
    const otp = await registerAndRequestOtp(email);

    const response = await request(app).post(RESET_PASSWORD_URL).send({
      email,
      otp,
      newPassword: "brand-new-secret",
    });

    expect(response.status).toBe(200);

    const loginResponse = await request(app).post(LOGIN_URL).send({
      email,
      password: "brand-new-secret",
    });
    expect(loginResponse.status).toBe(200);
  });

  it("returns a generic 401 for a wrong OTP and does not change the password", async () => {
    const email = "ada@example.com";
    await registerAndRequestOtp(email);

    const response = await request(app).post(RESET_PASSWORD_URL).send({
      email,
      otp: "000000",
      newPassword: "brand-new-secret",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_OTP");

    const loginResponse = await request(app).post(LOGIN_URL).send({
      email,
      password: "supersecret",
    });
    expect(loginResponse.status).toBe(200);
  });

  it("returns the same generic 401 for an unregistered email", async () => {
    const response = await request(app).post(RESET_PASSWORD_URL).send({
      email: "unknown@example.com",
      otp: "123456",
      newPassword: "brand-new-secret",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_OTP");
  });

  it("returns the same generic 401 for an expired OTP", async () => {
    const email = "ada@example.com";
    const otp = await registerAndRequestOtp(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.passwordResetOtp.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app).post(RESET_PASSWORD_URL).send({
      email,
      otp,
      newPassword: "brand-new-secret",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_OTP");
  });

  it("returns the same generic 401 for an already-consumed OTP", async () => {
    const email = "ada@example.com";
    const otp = await registerAndRequestOtp(email);

    await request(app).post(RESET_PASSWORD_URL).send({
      email,
      otp,
      newPassword: "brand-new-secret",
    });

    const response = await request(app).post(RESET_PASSWORD_URL).send({
      email,
      otp,
      newPassword: "another-secret",
    });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_OTP");
  });

  it("rejects an invalid body with 422", async () => {
    const response = await request(app).post(RESET_PASSWORD_URL).send({
      email: "ada@example.com",
      otp: "123456",
      newPassword: "short",
    });

    expect(response.status).toBe(422);
  });

  it("does not revoke the user's existing refresh-token sessions", async () => {
    const email = "ada@example.com";
    const registerResponse = await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email,
      password: "supersecret",
    });
    const setCookie = registerResponse.headers["set-cookie"];
    const cookies: string[] = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const refreshCookie = cookies.find((c) => c.startsWith("refresh_token="))!;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await request(app).post(FORGOT_PASSWORD_URL).send({ email });
    const logged = logSpy.mock.calls.flat().join(" ");
    logSpy.mockRestore();
    const otp = logged.match(/\b(\d{6})\b/)![1];

    await request(app).post(RESET_PASSWORD_URL).send({
      email,
      otp,
      newPassword: "brand-new-secret",
    });

    const refreshResponse = await request(app).post("/auth/refresh").set("Cookie", refreshCookie);
    expect(refreshResponse.status).toBe(200);
  });
});
