import { z } from "zod";

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const leaveTypeEnum = z.enum(["ANNUAL", "SICK", "PERSONAL", "UNPAID"]);
const leaveStatusEnum = z.enum(["PENDING", "APPROVED", "REJECTED"]);
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

export const createLeaveRequestSchema = z
  .object({
    type: leaveTypeEnum,
    start_date: dateString,
    end_date: dateString,
    reason: z.string().trim().max(2000).nullish(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: "end_date must be on or after start_date",
    path: ["end_date"],
  });

export const listLeaveQuerySchema = z
  .object({
    status: leaveStatusEnum.optional(),
    type: leaveTypeEnum.optional(),
    user_id: z.coerce.number().int().positive().optional(),
    // Interpreted as bounds: request.start_date >= start_date AND request.end_date <= end_date.
    start_date: dateString.optional(),
    end_date: dateString.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sort: z.enum(["created_at", "start_date", "end_date", "status"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  })
  .refine((query) => !query.start_date || !query.end_date || query.start_date <= query.end_date, {
    message: "start_date filter must be on or before end_date filter",
  });

export type ListLeaveQuery = z.infer<typeof listLeaveQuerySchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
