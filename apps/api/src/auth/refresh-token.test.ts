import { describe, expect, it } from "vitest";
import { generateRefreshToken, hashRefreshToken } from "./refresh-token.js";

const SECRET = "test-refresh-secret";

describe("refresh-token", () => {
  it("generates a random, non-empty raw token", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(a).toEqual(expect.any(String));
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it("hashes the same raw value to the same hash", () => {
    const raw = generateRefreshToken();

    expect(hashRefreshToken(raw, SECRET)).toBe(hashRefreshToken(raw, SECRET));
  });

  it("hashes two different raw values to different hashes", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();

    expect(hashRefreshToken(a, SECRET)).not.toBe(hashRefreshToken(b, SECRET));
  });

  it("never stores the raw value inside its own hash", () => {
    const raw = generateRefreshToken();

    expect(hashRefreshToken(raw, SECRET)).not.toContain(raw);
  });
});
