/**
 * Apply the latest migration to both dev and prod databases
 * 
 * Usage:
 *   pnpm exec dotenv -e .env -- tsx scripts/apply-migration-to-both-dbs.ts
 * 
 * This script will:
 * 1. Apply pending migrations to DEV database (using DATABASE_URL)
 * 2. Apply pending migrations to PROD database (using PROD_DATABASE_URL)
 */

import { execSync } from "child_process";

const devDbUrl = process.env.DATABASE_URL;
const prodDbUrl = process.env.PROD_DATABASE_URL;

if (!devDbUrl || !devDbUrl.startsWith("postgresql://")) {
  console.error("❌ Error: DATABASE_URL must be set to development PostgreSQL connection string");
  process.exit(1);
}

if (!prodDbUrl || !prodDbUrl.startsWith("postgresql://")) {
  console.error("❌ Error: PROD_DATABASE_URL must be set to production PostgreSQL connection string");
  process.exit(1);
}

async function applyMigrations() {
  console.log("🔄 Applying migrations to both databases...\n");

  // Step 1: Apply to DEV database
  console.log("📦 Step 1: Applying migrations to DEV database...");
  try {
    execSync("pnpm exec prisma migrate deploy", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: devDbUrl },
      cwd: process.cwd(),
    });
    console.log("✅ DEV database migration complete\n");
  } catch (error) {
    console.error("❌ Failed to apply migration to DEV database:", error);
    process.exit(1);
  }

  // Step 2: Apply to PROD database
  console.log("📦 Step 2: Applying migrations to PROD database...");
  try {
    execSync("pnpm exec prisma migrate deploy", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: prodDbUrl },
      cwd: process.cwd(),
    });
    console.log("✅ PROD database migration complete\n");
  } catch (error) {
    console.error("❌ Failed to apply migration to PROD database:", error);
    process.exit(1);
  }

  console.log("✅ All migrations applied successfully!");
}

applyMigrations().catch(console.error);

