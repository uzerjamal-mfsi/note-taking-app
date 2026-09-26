import crypto from "node:crypto";

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashRefreshToken(rawToken: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawToken).digest("hex");
}
