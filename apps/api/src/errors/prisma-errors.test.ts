import { Prisma } from "@note-taking-app/db";
import { describe, expect, it } from "vitest";
import { isForeignKeyConstraintError, isUniqueConstraintError } from "./prisma-errors.js";

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Prisma error", {
    code,
    clientVersion: "5.22.0",
  });
}

describe("isUniqueConstraintError", () => {
  it("returns true for a P2002 Prisma error", () => {
    expect(isUniqueConstraintError(prismaError("P2002"))).toBe(true);
  });

  it("returns false for a different Prisma error code", () => {
    expect(isUniqueConstraintError(prismaError("P2003"))).toBe(false);
  });

  it("returns false for a non-Prisma error", () => {
    expect(isUniqueConstraintError(new Error("boom"))).toBe(false);
  });

  it("returns false for a non-error value", () => {
    expect(isUniqueConstraintError("boom")).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });
});

describe("isForeignKeyConstraintError", () => {
  it("returns true for a P2003 Prisma error", () => {
    expect(isForeignKeyConstraintError(prismaError("P2003"))).toBe(true);
  });

  it("returns false for a different Prisma error code", () => {
    expect(isForeignKeyConstraintError(prismaError("P2002"))).toBe(false);
  });

  it("returns false for a non-Prisma error", () => {
    expect(isForeignKeyConstraintError(new Error("boom"))).toBe(false);
  });

  it("returns false for a non-error value", () => {
    expect(isForeignKeyConstraintError("boom")).toBe(false);
    expect(isForeignKeyConstraintError(null)).toBe(false);
    expect(isForeignKeyConstraintError(undefined)).toBe(false);
  });
});
