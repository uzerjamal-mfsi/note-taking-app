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

export const MAX_LIST_NOTES_PAGE_SIZE = 100;
export const MAX_LIST_NOTES_TAGS = 10;

export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_LIST_NOTES_PAGE_SIZE).default(20),
  sortBy: z.enum(["createdAt", "updatedAt"]).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  tags: z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    )
    .transform((tags) => (tags && tags.length > 0 ? tags : undefined))
    .refine((tags) => !tags || tags.length <= MAX_LIST_NOTES_TAGS, {
      message: `tags must contain at most ${MAX_LIST_NOTES_TAGS} entries`,
    }),
});
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;

export const paginatedNotesDtoSchema = z.object({
  data: z.array(noteDtoSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  }),
});
export type PaginatedNotesDto = z.infer<typeof paginatedNotesDtoSchema>;
