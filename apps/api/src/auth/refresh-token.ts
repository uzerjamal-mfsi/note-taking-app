import crypto from "node:crypto";
import { generateSecureToken } from "../crypto/secure-token.js";

export function generateRefreshToken(): string {
  return generateSecureToken();
}

export function hashRefreshToken(rawToken: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawToken).digest("hex");
}
