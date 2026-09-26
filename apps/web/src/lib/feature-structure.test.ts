import { describe, expect, it } from "vitest";
import { isDisallowedTopLevelSrcEntry } from "@note-taking-app/config/structure-rule";

describe("feature folder structure", () => {
  it("flags a feature-like file placed directly under src/", () => {
    expect(isDisallowedTopLevelSrcEntry("NoteEditor.tsx")).toBe(true);
  });

  it("allows the approved top-level src/ entries", () => {
    expect(isDisallowedTopLevelSrcEntry("features")).toBe(false);
    expect(isDisallowedTopLevelSrcEntry("App.tsx")).toBe(false);
    expect(isDisallowedTopLevelSrcEntry("main.tsx")).toBe(false);
  });
});
