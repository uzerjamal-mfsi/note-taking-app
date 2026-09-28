import { describe, expect, it } from "vitest";
import {
  combineNoteContent,
  extractFirstNodeText,
  splitNoteContent,
} from "./note-content-split.js";

describe("extractFirstNodeText", () => {
  it("extracts the plain text of the first node", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Grocery list" }] },
        { type: "paragraph", content: [{ type: "text", text: "Milk" }] },
      ],
    };

    expect(extractFirstNodeText(doc)).toBe("Grocery list");
  });

  it("returns an empty string when the first node has no text", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };

    expect(extractFirstNodeText(doc)).toBe("");
  });

  it("returns an empty string for an empty document", () => {
    expect(extractFirstNodeText({ type: "doc", content: [] })).toBe("");
  });
});

describe("splitNoteContent", () => {
  it("splits the first node's text as the title and the rest as the body", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Grocery list" }] },
        { type: "paragraph", content: [{ type: "text", text: "Milk" }] },
      ],
    };

    const { titleText, bodyContent } = splitNoteContent(doc);

    expect(titleText).toBe("Grocery list");
    expect(bodyContent).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Milk" }] }],
    });
  });

  it("falls back to a single empty paragraph body when there is no remaining content", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Grocery list" }] }],
    };

    const { bodyContent } = splitNoteContent(doc);

    expect(bodyContent).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("combineNoteContent", () => {
  it("recombines the title text as the first node with the body's content", () => {
    const bodyContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Milk" }] }],
    };

    const combined = combineNoteContent("Grocery list", bodyContent);

    expect(combined).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Grocery list" }] },
        { type: "paragraph", content: [{ type: "text", text: "Milk" }] },
      ],
    });
  });

  it("produces a title node with no text content when the title is empty", () => {
    const bodyContent = { type: "doc", content: [{ type: "paragraph" }] };

    const combined = combineNoteContent("", bodyContent);

    expect(combined).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [] }, { type: "paragraph" }],
    });
    expect(extractFirstNodeText(combined)).toBe("");
  });
});
