import { describe, expect, it } from "vitest";
import { errorResponseSchema } from "./error-response.js";

describe("errorResponseSchema", () => {
  it("accepts a valid payload with just code and message", () => {
    const result = errorResponseSchema.safeParse({
      code: "NOT_FOUND",
      message: "Resource not found",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid payload with optional details", () => {
    const result = errorResponseSchema.safeParse({
      code: "VALIDATION_FAILED",
      message: "Invalid input",
      details: [{ path: "email", message: "Required" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a payload missing code", () => {
    const result = errorResponseSchema.safeParse({
      message: "Resource not found",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a payload missing message", () => {
    const result = errorResponseSchema.safeParse({
      code: "NOT_FOUND",
    });

    expect(result.success).toBe(false);
  });
});
