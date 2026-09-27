import { z } from "zod";

const nameSchema = z.string().trim().min(1).max(100);
const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .transform((value) => value.toUpperCase());

export const createTagRequestSchema = z.object({
  name: nameSchema,
  color: colorSchema,
});
export type CreateTagRequest = z.infer<typeof createTagRequestSchema>;

export const updateTagRequestSchema = z
  .object({
    name: nameSchema.optional(),
    color: colorSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: "At least one of name or color is required",
  });
export type UpdateTagRequest = z.infer<typeof updateTagRequestSchema>;

export const tagDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
  noteCount: z.number(),
});
export type TagDto = z.infer<typeof tagDtoSchema>;
