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

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().email(),
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  email: z.string().trim().email(),
  otp: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const authAckResponseSchema = z.object({
  message: z.string(),
});
export type AuthAckResponse = z.infer<typeof authAckResponseSchema>;
