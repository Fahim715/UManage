import bcrypt from "bcryptjs";
import { Client } from "pg";
import { env } from "../config/env";

/**
 * Development-only seed. Creates one admin, two departments, one manager,
 * and two employees. Passwords must be provided through SEED_*_PASSWORD
 * variables; the script never supplies or prints default passwords.
 */
async function seed() {
  if (env.NODE_ENV === "production") {
    throw new Error("Seed script is development-only and must not run in production.");
  }

  const seedPasswords = {
    SEED_ADMIN_PASSWORD: env.SEED_ADMIN_PASSWORD,
    SEED_MANAGER_PASSWORD: env.SEED_MANAGER_PASSWORD,
    SEED_EMPLOYEE1_PASSWORD: env.SEED_EMPLOYEE1_PASSWORD,
    SEED_EMPLOYEE2_PASSWORD: env.SEED_EMPLOYEE2_PASSWORD,
  };
  const missingPasswords = Object.entries(seedPasswords)
    .filter(([, password]) => !password?.trim())
    .map(([name]) => name);
  if (missingPasswords.length > 0) {
    throw new Error(`Set these local seed password variables before seeding: ${missingPasswords.join(", ")}`);
  }

  const adminPassword = seedPasswords.SEED_ADMIN_PASSWORD!;
  const managerPassword = seedPasswords.SEED_MANAGER_PASSWORD!;
  const employee1Password = seedPasswords.SEED_EMPLOYEE1_PASSWORD!;
  const employee2Password = seedPasswords.SEED_EMPLOYEE2_PASSWORD!;

  const connectionString = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query("BEGIN");

    const [adminHash, managerHash, employee1Hash, employee2Hash] = await Promise.all([
      bcrypt.hash(adminPassword, 10),
      bcrypt.hash(managerPassword, 10),
      bcrypt.hash(employee1Password, 10),
      bcrypt.hash(employee2Password, 10),
    ]);

    const eng = await client.query(
      `INSERT INTO departments (name, description) VALUES ('Engineering', 'Software engineering team')
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`
    );
    const hr = await client.query(
      `INSERT INTO departments (name, description) VALUES ('Human Resources', 'People operations')
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`
    );
    const engId = eng.rows[0].id;
    const hrId = hr.rows[0].id;

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, 'ADMIN', NULL)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department_id = EXCLUDED.department_id`,
      ["Admin User", "admin@company.com", adminHash]
    );

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, 'MANAGER', $4)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department_id = EXCLUDED.department_id`,
      ["Engineering Manager", "manager@company.com", managerHash, engId]
    );

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, 'EMPLOYEE', $4)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department_id = EXCLUDED.department_id`,
      ["Alice Employee", "employee1@company.com", employee1Hash, engId]
    );

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, 'EMPLOYEE', $4)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department_id = EXCLUDED.department_id`,
      ["Bob Employee", "employee2@company.com", employee2Hash, hrId]
    );

    await client.query("COMMIT");

    console.log("Seed complete (development accounts):");
    console.log("  admin@company.com       role=ADMIN");
    console.log("  manager@company.com     role=MANAGER");
    console.log("  employee1@company.com   role=EMPLOYEE");
    console.log("  employee2@company.com   role=EMPLOYEE");
    console.log("  Passwords are the values configured in the local SEED_*_PASSWORD variables.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
