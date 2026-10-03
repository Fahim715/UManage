import type { Role } from "./auth";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";
export type LeaveType = "ANNUAL" | "SICK" | "PERSONAL" | "UNPAID";

export interface Department {
  id: number;
  name: string;
  description: string;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  department_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  department_id: number;
  assigned_to: number | null;
  created_by: number | null;
  due_date: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LeaveRequest {
  id: number;
  user_id: number;
  department_id: number;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  type: LeaveType;
  created_at: Date;
  updated_at: Date;
}
