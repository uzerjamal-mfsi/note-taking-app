import { describe, expect, it } from "vitest";
import { START_SENTINEL, STOP_SENTINEL, parseSentinelHighlight } from "./sentinel-highlight.js";

describe("parseSentinelHighlight", () => {
  it("returns the plain text with no ranges when there is no match", () => {
    const raw = "Grocery list";

    expect(parseSentinelHighlight(raw)).toEqual({ text: "Grocery list", ranges: [] });
  });

  it("extracts a single match range and strips the sentinels", () => {
    const raw = `${START_SENTINEL}Grocery${STOP_SENTINEL} list`;

    expect(parseSentinelHighlight(raw)).toEqual({
      text: "Grocery list",
      ranges: [{ start: 0, end: 7 }],
    });
  });

  it("extracts multiple match ranges in one string", () => {
    const raw = `${START_SENTINEL}Buy${STOP_SENTINEL} eggs and ${START_SENTINEL}milk${STOP_SENTINEL}`;

    expect(parseSentinelHighlight(raw)).toEqual({
      text: "Buy eggs and milk",
      ranges: [
        { start: 0, end: 3 },
        { start: 13, end: 17 },
      ],
    });
  });

  it("handles a match adjacent to punctuation without shifting the range", () => {
    const raw = `${START_SENTINEL}eggs${STOP_SENTINEL}, milk.`;

    expect(parseSentinelHighlight(raw)).toEqual({
      text: "eggs, milk.",
      ranges: [{ start: 0, end: 4 }],
    });
  });

  it("handles a match at the very end of the string", () => {
    const raw = `Buy ${START_SENTINEL}milk${STOP_SENTINEL}`;

    expect(parseSentinelHighlight(raw)).toEqual({
      text: "Buy milk",
      ranges: [{ start: 4, end: 8 }],
    });
  });

  it("returns an empty text/ranges for an empty string", () => {
    expect(parseSentinelHighlight("")).toEqual({ text: "", ranges: [] });
  });

  it("treats an unclosed start sentinel as plain text rather than throwing", () => {
    const raw = `Buy ${START_SENTINEL}milk`;

    expect(parseSentinelHighlight(raw)).toEqual({ text: "Buy milk", ranges: [] });
  });
});
