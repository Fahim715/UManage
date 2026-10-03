import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
// Fallback to repo-root .env.local so DATABASE_URL is found either way.
dotenv.config({ path: path.resolve(process.cwd(), "../.env.local") });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .refine((secret) => !/\s/.test(secret), "JWT_SECRET must not contain whitespace"),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^[1-9]\d{0,5}[smhd]$/, "JWT_EXPIRES_IN must be a positive duration such as '15m', '1h', or '7d'")
    .default("1h"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:4200"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_MANAGER_PASSWORD: z.string().optional(),
  SEED_EMPLOYEE1_PASSWORD: z.string().optional(),
  SEED_EMPLOYEE2_PASSWORD: z.string().optional(),
});

export const env = envSchema.parse(process.env);
