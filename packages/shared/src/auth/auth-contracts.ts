import { z } from "zod";

export const registerRequestSchema = z.object({
  name: z.string().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});
export type AuthUserDto = z.infer<typeof authUserDtoSchema>;

export const authResponseDtoSchema = z.object({
  user: authUserDtoSchema,
  accessToken: z.string(),
});
export type AuthResponseDto = z.infer<typeof authResponseDtoSchema>;
