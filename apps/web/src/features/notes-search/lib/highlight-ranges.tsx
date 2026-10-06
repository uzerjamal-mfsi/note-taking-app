import type { ReactNode } from "react";
import type { MatchRange } from "@note-taking-app/shared";

/**
 * Never trusts the API to hand back sorted, non-overlapping, in-bounds ranges:
 * sorts by start, clamps each bound to [0, text.length], and merges/drops any
 * range that becomes empty or still overlaps the previous one after clamping.
 */
function normalizeRanges(text: string, ranges: MatchRange[]): MatchRange[] {
  const clamped = ranges
    .map((range) => ({
      start: Math.min(Math.max(range.start, 0), text.length),
      end: Math.min(Math.max(range.end, 0), text.length),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const normalized: MatchRange[] = [];
  for (const range of clamped) {
    const last = normalized[normalized.length - 1];
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      normalized.push({ ...range });
    }
  }
  return normalized;
}

/**
 * Renders `text` as plain-text React nodes, wrapping each `range` in `<mark>`.
 * `text` is never interpreted as HTML/markup - only ever sliced into substrings.
 */
export function highlightRanges(text: string, ranges: MatchRange[]): ReactNode[] {
  const normalized = normalizeRanges(text, ranges);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  normalized.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    nodes.push(<mark key={index}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}
