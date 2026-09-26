import { randomUUID } from "node:crypto";
import { prisma } from "@note-taking-app/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "./auth-service.js";

const authService = new AuthService(prisma);

async function createUser() {
  return prisma.user.create({
    data: {
      name: "Ada Lovelace",
      email: `ada-${randomUUID()}@example.com`,
      passwordHash: "irrelevant-for-this-test",
    },
  });
}

beforeEach(async () => {
  await prisma.passwordResetOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function timeIt(fn: () => Promise<unknown>): Promise<number> {
  const start = process.hrtime.bigint();
  await fn();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000;
}

describe("AuthService.requestPasswordReset timing", () => {
  it("takes comparable time for an unregistered email as for a registered one", async () => {
    const user = await createUser();

    // Warm up so JIT/connection-pool overhead doesn't dominate the first sample.
    await authService.requestPasswordReset(user.email);
    await authService.requestPasswordReset("warmup-unknown@example.com");

    const registeredSamples: number[] = [];
    const unknownSamples: number[] = [];
    const SAMPLE_COUNT = 5;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      registeredSamples.push(await timeIt(() => authService.requestPasswordReset(user.email)));
      unknownSamples.push(
        await timeIt(() => authService.requestPasswordReset(`unknown-${i}@example.com`)),
      );
    }

    const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const registeredAvg = average(registeredSamples);
    const unknownAvg = average(unknownSamples);

    // Both paths do one bcrypt hash of the same cost; allow generous slack
    // for scheduling noise while still catching a missing dummy-hash call
    // (which would make the unknown-email path many times faster).
    const ratio = Math.max(registeredAvg, unknownAvg) / Math.min(registeredAvg, unknownAvg);
    expect(ratio).toBeLessThan(3);
  });
});
