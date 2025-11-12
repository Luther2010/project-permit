/**
 * Step 1: Export SQLite data to JSON
 * 
 * IMPORTANT: Temporarily change schema.prisma to provider = "sqlite"
 * 
 * Steps:
 *   1. Change schema.prisma: provider = "sqlite"
 *   2. Run: pnpm prisma generate
 *   3. Set OLD_DATABASE_URL to your SQLite path (or defaults to ./prisma/dev.db)
 *   4. Run: pnpm export-sqlite
 *   5. Change schema.prisma back: provider = "postgresql"
 *   6. Run: pnpm prisma generate
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

// Use OLD_DATABASE_URL if set, otherwise default to SQLite path
// Don't use DATABASE_URL from .env as it might be PostgreSQL
const oldDbUrl = process.env.OLD_DATABASE_URL || "file:./prisma/dev.db";
const outputFile = path.join(process.cwd(), "sqlite-export.json");

const sqlitePrisma = new PrismaClient({
  datasources: {
    db: {
      url: oldDbUrl,
    },
  },
});

async function exportData() {
  console.log("📤 Exporting SQLite data to JSON...\n");

  try {
    await sqlitePrisma.$connect();
    console.log("✅ Connected to SQLite database\n");

    const data = {
      contractors: await sqlitePrisma.contractor.findMany({
        include: { classifications: true },
      }),
      users: await sqlitePrisma.user.findMany({
        include: {
          accounts: true,
          subscription: true,
        },
      }),
      permits: await sqlitePrisma.permit.findMany({
        include: {
          contractors: {
            include: {
              contractor: true,
            },
          },
        },
      }),
    };

    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`✅ Exported data to ${outputFile}`);
    console.log(`   - ${data.contractors.length} contractors`);
    console.log(`   - ${data.users.length} users`);
    console.log(`   - ${data.permits.length} permits`);
  } catch (error) {
    console.error("❌ Export failed:", error);
    throw error;
  } finally {
    await sqlitePrisma.$disconnect();
  }
}

exportData().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

