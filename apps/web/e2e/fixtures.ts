import { randomBytes } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { waitForOtp } from "./otp-log.js";

export interface E2EUser {
  name: string;
  email: string;
  password: string;
  newPassword: string;
}

/** A user no previous run can have registered, so reruns need no database cleanup. */
export function uniqueUser(): E2EUser {
  const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  return {
    name: "E2E Tester",
    email: `e2e-${suffix}@example.test`,
    password: "E2e-password-1",
    newPassword: "E2e-new-password-2",
  };
}

const API_URL = "http://localhost:4000";

/**
 * Creates a tag for the user straight through the API. The web UI can only toggle existing tags
 * (there is no tag-creation screen), so the journey seeds one here and exercises the rest in the UI.
 */
export async function createTagViaApi(
  request: APIRequestContext,
  user: Pick<E2EUser, "email" | "password">,
  name: string,
): Promise<void> {
  const login = await request.post(`${API_URL}/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  if (!login.ok()) {
    throw new Error(`E2E tag setup: login failed with status ${login.status()}`);
  }
  const { accessToken } = (await login.json()) as { accessToken: string };

  const created = await request.post(`${API_URL}/tags`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name, color: "#ff8800" },
  });
  if (!created.ok()) {
    throw new Error(`E2E tag setup: creating tag "${name}" failed with status ${created.status()}`);
  }
}

/** Reads the password-reset OTP the API logged for this email (10s timeout, diagnostic error). */
export function getOtp(email: string): Promise<string> {
  return waitForOtp(email);
}
