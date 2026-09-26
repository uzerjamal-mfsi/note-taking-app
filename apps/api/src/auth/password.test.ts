import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("supersecret");

    await expect(verifyPassword("supersecret", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password against the hash", async () => {
    const hash = await hashPassword("supersecret");

    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("never stores the password in plaintext", async () => {
    const hash = await hashPassword("supersecret");

    expect(hash).not.toBe("supersecret");
    expect(hash).not.toContain("supersecret");
  });
});
