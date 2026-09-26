import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./access-token.js";

const SECRET = "test-access-secret";

describe("access-token", () => {
  it("round-trips a user id and exposes exactly the expected claims", () => {
    const token = signAccessToken({ userId: "user-1" }, SECRET);

    const claims = verifyAccessToken(token, SECRET);

    expect(claims.sub).toBe("user-1");
    expect(typeof claims.iat).toBe("number");
    expect(typeof claims.exp).toBe("number");
    expect(typeof claims.jti).toBe("string");
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it("rejects an expired token", () => {
    const token = jwt.sign({ sub: "user-1", jti: "test-jti" }, SECRET, {
      algorithm: "HS256",
      expiresIn: -1,
    });

    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });

  it("rejects a token signed with a different algorithm", () => {
    const token = jwt.sign({ sub: "user-1", jti: "test-jti" }, SECRET, {
      algorithm: "HS384",
      expiresIn: "15m",
    });

    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });

  it("rejects an unsigned token (alg: none)", () => {
    const token = jwt.sign({ sub: "user-1", jti: "test-jti" }, null, {
      algorithm: "none",
      expiresIn: "15m",
    });

    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = signAccessToken({ userId: "user-1" }, "a-different-secret");

    expect(() => verifyAccessToken(token, SECRET)).toThrow();
  });
});
