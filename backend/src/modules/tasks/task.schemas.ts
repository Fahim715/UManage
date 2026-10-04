import { z } from "zod";

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const statusEnum = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day >= 1 && day <= daysInMonth[month - 1];
  }, "Expected a valid calendar date");

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).nullish(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  due_date: dateString.nullish(),
  assigned_to: z.number().int().positive().nullish(),
  department_id: z.number().int().positive(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable(),
    status: statusEnum,
    priority: priorityEnum,
    due_date: dateString.nullable(),
    assigned_to: z.number().int().positive().nullable(),
    department_id: z.number().int().positive(),
    created_by: z.number().int().positive().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export const updateStatusSchema = z.object({
  status: statusEnum,
});

export const listTasksQuerySchema = z
  .object({
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    assigned_to: z.coerce.number().int().positive().optional(),
    department_id: z.coerce.number().int().positive().optional(),
    due_date_from: dateString.optional(),
    due_date_to: dateString.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sort: z.enum(["created_at", "due_date", "priority", "status", "title"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  })
  .refine(
    (q) => !q.due_date_from || !q.due_date_to || q.due_date_from <= q.due_date_to,
    { message: "due_date_from must be on or before due_date_to" }
  );

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
