import { Pool } from "pg";
import { env } from "./env";

// Neon requires SSL; pooled endpoint works for normal app traffic.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

pool.on("error", (err) => {
  console.error("Unexpected idle client error", err);
});
