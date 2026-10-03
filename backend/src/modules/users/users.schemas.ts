import { z } from "zod";

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const roleSchema = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]);

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
  role: roleSchema.default("EMPLOYEE"),
  department_id: z.number().int().positive().nullish(),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(255),
    department_id: z.number().int().positive().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export const changeRoleSchema = z.object({
  role: roleSchema,
});

export const changeDepartmentSchema = z.object({
  department_id: z.number().int().positive().nullable(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
