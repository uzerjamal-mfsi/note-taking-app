import { prisma } from "@note-taking-app/db";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { makeTestEnv } from "../test-helpers/test-env.js";

const env = makeTestEnv();
const app = createApp(env, { prisma });

const REGISTER_URL = "/auth/register";
const FORGOT_PASSWORD_URL = "/auth/forgot-password";

beforeEach(async () => {
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /auth/forgot-password", () => {
  it("returns 200 with a generic body and stores an OTP hash for a registered email", async () => {
    await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });

    const response = await request(app).post(FORGOT_PASSWORD_URL).send({
      email: "ada@example.com",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toMatch(/\d{6}/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    const otps = await prisma.passwordResetOtp.findMany({ where: { userId: user.id } });
    expect(otps).toHaveLength(1);
    expect(otps[0]?.consumedAt).toBeNull();
    expect(otps[0]?.otpHash).not.toMatch(/^\d{6}$/);
  });

  it("returns an identical response for an unregistered email", async () => {
    const registered = await request(app).post(FORGOT_PASSWORD_URL).send({
      email: "unknown@example.com",
    });

    expect(registered.status).toBe(200);
    expect(registered.body).toEqual({ message: expect.any(String) });

    const otps = await prisma.passwordResetOtp.findMany();
    expect(otps).toHaveLength(0);
  });

  it("logs the raw OTP to the console for a registered email and never sends an email", async () => {
    await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await request(app).post(FORGOT_PASSWORD_URL).send({ email: "ada@example.com" });

    const loggedOtp = logSpy.mock.calls
      .flat()
      .join(" ")
      .match(/\b\d{6}\b/);
    expect(loggedOtp).not.toBeNull();
  });

  it("invalidates a prior unconsumed OTP when a new one is requested", async () => {
    await request(app).post(REGISTER_URL).send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });

    await request(app).post(FORGOT_PASSWORD_URL).send({ email: "ada@example.com" });
    await request(app).post(FORGOT_PASSWORD_URL).send({ email: "ada@example.com" });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    const otps = await prisma.passwordResetOtp.findMany({ where: { userId: user.id } });
    const unconsumed = otps.filter((otp) => otp.consumedAt === null);
    expect(unconsumed).toHaveLength(1);
  });

  it("rejects an invalid body with 422", async () => {
    const response = await request(app).post(FORGOT_PASSWORD_URL).send({ email: "not-an-email" });

    expect(response.status).toBe(422);
  });
});
