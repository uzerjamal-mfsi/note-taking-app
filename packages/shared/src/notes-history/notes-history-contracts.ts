import { z } from "zod";

export const noteVersionParamSchema = z.object({
  id: z.string().min(1),
  versionId: z.string().min(1),
});
export type NoteVersionParam = z.infer<typeof noteVersionParamSchema>;

export const noteVersionSummaryResponseSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  title: z.string(),
  createdAt: z.string(),
});
export type NoteVersionSummaryDto = z.infer<typeof noteVersionSummaryResponseSchema>;

export const noteVersionResponseSchema = noteVersionSummaryResponseSchema.extend({
  content: z.record(z.unknown()),
});
export type NoteVersionDto = z.infer<typeof noteVersionResponseSchema>;
