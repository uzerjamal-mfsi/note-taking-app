import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const API_LOG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), ".api.log");
export const OTP_TIMEOUT_MS = 10_000;
export const OTP_POLL_INTERVAL_MS = 100;
const TAIL_LINES = 20;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The most recent OTP logged for exactly this email, or null when there is none. */
export function findOtp(logText: string, email: string): string | null {
  const pattern = new RegExp(
    `\\[password-reset\\] OTP for ${escapeRegExp(email)}: (\\d{6})\\s*$`,
    "gm",
  );
  const matches = [...logText.matchAll(pattern)];
  return matches.at(-1)?.[1] ?? null;
}

function tail(logText: string, lines: number): string {
  const all = logText.split(/\r?\n/).filter((line) => line.length > 0);
  return all.slice(-lines).join("\n");
}

export interface OtpFailureDetails {
  email: string;
  logPath: string;
  timeoutMs: number;
  fileExists: boolean;
  logText: string;
}

/** A failure message that says what was looked for, where, for how long, and what was found. */
export function describeOtpFailure(details: OtpFailureDetails): string {
  const { email, logPath, timeoutMs, fileExists, logText } = details;
  let state: string;
  if (!fileExists) {
    state = "the log file does not exist (is the API started through e2e/start-api.mjs?)";
  } else if (logText.length === 0) {
    state = "the log file exists but is empty";
  } else {
    state = `last ${TAIL_LINES} log lines:\n${tail(logText, TAIL_LINES)}`;
  }
  return [
    `No password-reset OTP for "${email}" appeared within ${timeoutMs}ms.`,
    `Expected a line matching: [password-reset] OTP for ${email}: <6 digits>`,
    `Log file: ${logPath}`,
    state,
  ].join("\n");
}

function readLog(logPath: string): { fileExists: boolean; logText: string } {
  if (!existsSync(logPath)) {
    return { fileExists: false, logText: "" };
  }
  return { fileExists: true, logText: readFileSync(logPath, "utf8") };
}

export interface WaitForOtpOptions {
  logPath?: string;
  timeoutMs?: number;
  intervalMs?: number;
}

/** Polls the API log until an OTP for the email shows up, or throws a diagnostic error. */
export async function waitForOtp(email: string, options: WaitForOtpOptions = {}): Promise<string> {
  const logPath = options.logPath ?? API_LOG_PATH;
  const timeoutMs = options.timeoutMs ?? OTP_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? OTP_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const { fileExists, logText } = readLog(logPath);
    const otp = findOtp(logText, email);
    if (otp) {
      return otp;
    }
    if (Date.now() >= deadline) {
      throw new Error(describeOtpFailure({ email, logPath, timeoutMs, fileExists, logText }));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
