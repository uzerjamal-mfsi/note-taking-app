import type { NoteDto } from "@note-taking-app/shared";

export type ProseMirrorDoc = NoteDto["content"];
type ProseMirrorNode = Record<string, unknown>;

function collectText(node: unknown): string {
  if (typeof node !== "object" || node === null) {
    return "";
  }
  const record = node as ProseMirrorNode;
  const ownText = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.content) ? record.content : [];
  return ownText + children.map(collectText).join("");
}

/** Mirrors the API's own title derivation (apps/api/src/notes/notes-service.ts's collectText/deriveTitle). */
export function extractFirstNodeText(doc: ProseMirrorDoc): string {
  const content = (doc as { content?: unknown[] } | null)?.content;
  const firstNode = Array.isArray(content) ? content[0] : undefined;
  return collectText(firstNode).trim();
}

const EMPTY_BODY_CONTENT: ProseMirrorDoc = { type: "doc", content: [{ type: "paragraph" }] };

/** Splits a note's document into the title input's initial text and the body editor's seed document. */
export function splitNoteContent(doc: ProseMirrorDoc): {
  titleText: string;
  bodyContent: ProseMirrorDoc;
} {
  const content = (doc as { content?: unknown[] } | null)?.content;
  const nodes = Array.isArray(content) ? content : [];
  const [, ...rest] = nodes;
  return {
    titleText: extractFirstNodeText(doc),
    bodyContent: rest.length > 0 ? { type: "doc", content: rest } : EMPTY_BODY_CONTENT,
  };
}

/** Recombines the title input's text (as the document's first node) with the body editor's current content. */
export function combineNoteContent(titleText: string, bodyContent: ProseMirrorDoc): ProseMirrorDoc {
  const bodyNodes = Array.isArray((bodyContent as { content?: unknown[] } | null)?.content)
    ? ((bodyContent as { content: unknown[] }).content ?? [])
    : [];
  const titleNode = {
    type: "paragraph",
    content: titleText.length > 0 ? [{ type: "text", text: titleText }] : [],
  };
  return { type: "doc", content: [titleNode, ...bodyNodes] };
}
