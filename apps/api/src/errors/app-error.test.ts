import { describe, expect, it } from "vitest";
import { AppError } from "./app-error.js";

describe("AppError", () => {
  it("sets status, code, and message", () => {
    const error = new AppError("NOT_FOUND", 404, "Note not found");

    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Note not found");
    expect(error).toBeInstanceOf(Error);
  });

  it("accepts optional details", () => {
    const error = new AppError("VALIDATION_FAILED", 400, "Invalid input", { field: "email" });

    expect(error.details).toEqual({ field: "email" });
  });
});
