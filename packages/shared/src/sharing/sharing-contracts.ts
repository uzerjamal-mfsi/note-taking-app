import { z } from "zod";

export const noteIdParamSchema = z.object({ id: z.string().min(1) });
export type NoteIdParam = z.infer<typeof noteIdParamSchema>;

export const shareTokenParamSchema = z.object({ token: z.string().min(1) });
export type ShareTokenParam = z.infer<typeof shareTokenParamSchema>;

export const generateShareLinkRequestSchema = z.object({
  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be a valid ISO 8601 timestamp" })
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: "expiresAt must be strictly in the future",
    })
    .optional(),
});
export type GenerateShareLinkRequest = z.infer<typeof generateShareLinkRequestSchema>;

export const shareLinkDtoSchema = z.object({
  token: z.string(),
  viewCount: z.number(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ShareLinkDto = z.infer<typeof shareLinkDtoSchema>;

export const sharedNotePublicDtoSchema = z.object({
  title: z.string(),
  content: z.record(z.unknown()),
});
export type SharedNotePublicDto = z.infer<typeof sharedNotePublicDtoSchema>;
