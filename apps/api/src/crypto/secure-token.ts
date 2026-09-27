import crypto from "node:crypto";

/** A cryptographically secure, URL-safe random token (32 bytes, base64url-encoded). */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
