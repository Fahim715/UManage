import fs from "fs";
import path from "path";
import { Client } from "pg";
import { env } from "../config/env";

/**
 * Minimal migration runner.
 * - Reads migrations/*.sql in filename order.
 * - Tracks applied migrations in the schema_migrations table.
 * - Never runs the same migration twice.
 * - Runs each migration in its own transaction.
 */
async function migrate() {
  const connectionString = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  // A session-level lock prevents two deploy/dev processes from applying the
  // same pending migration at the same time.
  const migrationLockId = 1431127373;
  let lockAcquired = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = path.resolve(process.cwd(), "migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (!/^\d{3,}_[a-z0-9_-]+\.sql$/.test(file)) {
        throw new Error(`Invalid migration filename: ${file}`);
      }
    }

    const appliedResult = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations"
    );
    const applied = new Set(appliedResult.rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`apply ${file} ...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`ok    ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }

    console.log("Migrations complete.");
  } finally {
    if (lockAcquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    }
    await client.end();
  }
}

migrate().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
