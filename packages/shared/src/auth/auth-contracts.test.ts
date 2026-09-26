import { describe, expect, it } from "vitest";
import {
  authAckResponseSchema,
  authResponseDtoSchema,
  authUserDtoSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
} from "./auth-contracts.js";

describe("registerRequestSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerRequestSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing email", () => {
    const result = registerRequestSchema.safeParse({
      name: "Ada Lovelace",
      password: "supersecret",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = registerRequestSchema.safeParse({
      name: "Ada Lovelace",
      email: "not-an-email",
      password: "supersecret",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerRequestSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "short",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing name", () => {
    const result = registerRequestSchema.safeParse({
      email: "ada@example.com",
      password: "supersecret",
    });

    expect(result.success).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("accepts a valid login payload", () => {
    const result = loginRequestSchema.safeParse({
      email: "ada@example.com",
      password: "supersecret",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing email", () => {
    const result = loginRequestSchema.safeParse({
      password: "supersecret",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing password", () => {
    const result = loginRequestSchema.safeParse({
      email: "ada@example.com",
    });

    expect(result.success).toBe(false);
  });
});

describe("authUserDtoSchema", () => {
  it("accepts id, name, and email with no password or hash field", () => {
    const result = authUserDtoSchema.safeParse({
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
    });

    expect(result.success).toBe(true);
  });

  it("strips a password field if present, rather than exposing it", () => {
    const result = authUserDtoSchema.safeParse({
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "supersecret",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("password");
    }
  });
});

describe("authResponseDtoSchema", () => {
  it("accepts a user and an access token", () => {
    const result = authResponseDtoSchema.safeParse({
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      accessToken: "signed.jwt.token",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing accessToken", () => {
    const result = authResponseDtoSchema.safeParse({
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
    });

    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordRequestSchema", () => {
  it("accepts a valid email", () => {
    const result = forgotPasswordRequestSchema.safeParse({
      email: "ada@example.com",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing email", () => {
    const result = forgotPasswordRequestSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = forgotPasswordRequestSchema.safeParse({
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });
});

describe("resetPasswordRequestSchema", () => {
  it("accepts a valid email, otp, and new password", () => {
    const result = resetPasswordRequestSchema.safeParse({
      email: "ada@example.com",
      otp: "123456",
      newPassword: "supersecret",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing email", () => {
    const result = resetPasswordRequestSchema.safeParse({
      otp: "123456",
      newPassword: "supersecret",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing otp", () => {
    const result = resetPasswordRequestSchema.safeParse({
      email: "ada@example.com",
      newPassword: "supersecret",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing newPassword", () => {
    const result = resetPasswordRequestSchema.safeParse({
      email: "ada@example.com",
      otp: "123456",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a newPassword shorter than 8 characters", () => {
    const result = resetPasswordRequestSchema.safeParse({
      email: "ada@example.com",
      otp: "123456",
      newPassword: "short",
    });

    expect(result.success).toBe(false);
  });
});

describe("authAckResponseSchema", () => {
  it("accepts a message", () => {
    const result = authAckResponseSchema.safeParse({
      message: "If that email is registered, we've sent a code.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing message", () => {
    const result = authAckResponseSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
