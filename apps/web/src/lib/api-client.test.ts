import { describe, expect, it } from "vitest";
import { normalizeApiError } from "./api-client.js";

describe("normalizeApiError", () => {
  it("turns an ErrorResponse-shaped payload into a consistent error object", () => {
    const normalized = normalizeApiError(404, {
      code: "NOTE_NOT_FOUND",
      message: "Note not found",
    });

    expect(normalized).toEqual({
      status: 404,
      code: "NOTE_NOT_FOUND",
      message: "Note not found",
      details: undefined,
    });
  });

  it("carries through optional details", () => {
    const normalized = normalizeApiError(400, {
      code: "VALIDATION_FAILED",
      message: "Invalid input",
      details: [{ path: "email" }],
    });

    expect(normalized.details).toEqual([{ path: "email" }]);
  });

  it("falls back to a generic shape for a non-ErrorResponse payload", () => {
    const normalized = normalizeApiError(500, "unexpected html error page");

    expect(normalized).toEqual({
      status: 500,
      code: "UNKNOWN_ERROR",
      message: "Something went wrong",
      details: undefined,
    });
  });
});
