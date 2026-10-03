import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const passwordSchema = z
  .string()
  .min(8, "New password must be at least 8 characters")
  .max(72, "New password must be at most 72 characters")
  .regex(/[A-Za-z]/, "New password must contain a letter")
  .regex(/[0-9]/, "New password must contain a number")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, "New password must be at most 72 bytes");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
