import type { MatchRange } from "@note-taking-app/shared";

/**
 * Control characters used as ts_headline's StartSel/StopSel (see
 * notes-search-repository.ts). Chosen over visible markup like `<mark>` so a
 * literal `<mark>` typed into a note's own text can never be confused with a
 * real delimiter (see design.md, Decision 4).
 */
export const START_SENTINEL = "\u0001";
export const STOP_SENTINEL = "\u0002";

export interface SentinelHighlight {
  text: string;
  ranges: MatchRange[];
}

/**
 * Strips START_SENTINEL/STOP_SENTINEL pairs out of a ts_headline result,
 * recording the character offsets (in the sentinel-stripped text) where each
 * match occurred. Never emits markup — only plain text plus ranges.
 */
export function parseSentinelHighlight(raw: string): SentinelHighlight {
  let text = "";
  const ranges: MatchRange[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const startIdx = raw.indexOf(START_SENTINEL, cursor);
    if (startIdx === -1) {
      text += raw.slice(cursor);
      break;
    }

    text += raw.slice(cursor, startIdx);

    const stopIdx = raw.indexOf(STOP_SENTINEL, startIdx + 1);
    if (stopIdx === -1) {
      // Malformed (no closing sentinel): treat the remainder as plain text.
      text += raw.slice(startIdx + 1);
      break;
    }

    const rangeStart = text.length;
    text += raw.slice(startIdx + 1, stopIdx);
    ranges.push({ start: rangeStart, end: text.length });
    cursor = stopIdx + 1;
  }

  return { text, ranges };
}
