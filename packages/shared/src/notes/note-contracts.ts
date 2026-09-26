import { z } from "zod";

export const MAX_CONTENT_DEPTH = 50;

type ProseMirrorNode = Record<string, unknown>;

function nodeDepth(node: unknown): number {
  if (typeof node !== "object" || node === null) {
    return 1;
  }

  const children = (node as ProseMirrorNode).content;
  if (!Array.isArray(children) || children.length === 0) {
    return 1;
  }

  let deepestChild = 0;
  for (const child of children) {
    const childDepth = nodeDepth(child);
    if (childDepth > deepestChild) {
      deepestChild = childDepth;
    }
  }
  return 1 + deepestChild;
}

const proseMirrorDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.record(z.unknown())).min(1),
  })
  .superRefine((doc, ctx) => {
    const deepestTopLevelChild = Math.max(...doc.content.map(nodeDepth));
    if (deepestTopLevelChild > MAX_CONTENT_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `content exceeds maximum nesting depth of ${MAX_CONTENT_DEPTH}`,
      });
    }
  });

export const createNoteRequestSchema = z.object({
  content: proseMirrorDocSchema,
});
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

export const updateNoteRequestSchema = z.object({
  content: proseMirrorDocSchema,
});
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;

export const noteDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NoteDto = z.infer<typeof noteDtoSchema>;
