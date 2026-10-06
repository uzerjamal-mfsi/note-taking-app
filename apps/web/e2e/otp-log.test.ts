import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeOtpFailure, findOtp, waitForOtp } from "./otp-log.js";

describe("findOtp", () => {
  it("returns the most recent OTP for the exact email", () => {
    const log = [
      "api listening on port 4000",
      "[password-reset] OTP for ada@example.test: 111111",
      "[password-reset] OTP for bob@example.test: 222222",
      "[password-reset] OTP for ada@example.test: 333333",
    ].join("\n");

    expect(findOtp(log, "ada@example.test")).toBe("333333");
    expect(findOtp(log, "bob@example.test")).toBe("222222");
  });

  it("does not match an email that merely contains the searched one", () => {
    const log = "[password-reset] OTP for xada@example.test: 123456\n";

    expect(findOtp(log, "ada@example.test")).toBeNull();
  });

  it("treats regex characters in the email literally", () => {
    const log = "[password-reset] OTP for a.b+c@example.test: 123456\n";

    expect(findOtp(log, "a.b+c@example.test")).toBe("123456");
    expect(findOtp(log, "aXb+c@example.test")).toBeNull();
  });

  it("handles CRLF line endings", () => {
    expect(findOtp("[password-reset] OTP for a@example.test: 654321\r\n", "a@example.test")).toBe(
      "654321",
    );
  });
});

describe("describeOtpFailure", () => {
  const base = { email: "ada@example.test", logPath: "/tmp/.api.log", timeoutMs: 10_000 };

  it("explains a missing log file", () => {
    const message = describeOtpFailure({ ...base, fileExists: false, logText: "" });

    expect(message).toContain("ada@example.test");
    expect(message).toContain("/tmp/.api.log");
    expect(message).toContain("10000ms");
    expect(message).toContain("does not exist");
  });

  it("explains an empty log file", () => {
    const message = describeOtpFailure({ ...base, fileExists: true, logText: "" });

    expect(message).toContain("exists but is empty");
  });

  it("includes only the last 20 lines of a non-matching log", () => {
    const logText = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");

    const message = describeOtpFailure({ ...base, fileExists: true, logText });

    expect(message).toContain("line 30");
    expect(message).toContain("line 11");
    expect(message).not.toContain("line 10\n");
  });
});

describe("waitForOtp", () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "otp-log-"));
    logPath = path.join(dir, ".api.log");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an OTP that is already in the log", async () => {
    writeFileSync(logPath, "[password-reset] OTP for ada@example.test: 123456\n");

    await expect(waitForOtp("ada@example.test", { logPath })).resolves.toBe("123456");
  });

  it("picks up an OTP written while polling", async () => {
    writeFileSync(logPath, "api listening on port 4000\n");
    setTimeout(() => {
      writeFileSync(logPath, "[password-reset] OTP for ada@example.test: 987654\n");
    }, 60);

    await expect(
      waitForOtp("ada@example.test", { logPath, timeoutMs: 2_000, intervalMs: 20 }),
    ).resolves.toBe("987654");
  });

  it("times out with diagnostics when the line never appears", async () => {
    writeFileSync(logPath, "api listening on port 4000\n");

    await expect(
      waitForOtp("ada@example.test", { logPath, timeoutMs: 150, intervalMs: 20 }),
    ).rejects.toThrow(/ada@example\.test[\s\S]*150ms[\s\S]*api listening on port 4000/);
  });

  it("times out with diagnostics when the file is missing", async () => {
    await expect(
      waitForOtp("ada@example.test", { logPath, timeoutMs: 100, intervalMs: 20 }),
    ).rejects.toThrow(/does not exist/);
  });
});
