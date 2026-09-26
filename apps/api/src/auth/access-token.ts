import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";
const ACCESS_TOKEN_TTL = "15m";

export interface AccessTokenClaims {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

export function signAccessToken(payload: { userId: string }, secret: string): string {
  return jwt.sign({ sub: payload.userId, jti: crypto.randomUUID() }, secret, {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenClaims {
  return jwt.verify(token, secret, { algorithms: [ALGORITHM] }) as AccessTokenClaims;
}
