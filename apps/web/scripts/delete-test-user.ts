/**
 * Delete a test user and their subscription from the database
 * 
 * Usage:
 *   # Delete from dev database (default, uses DATABASE_URL)
 *   pnpm exec dotenv -e .env -- tsx scripts/delete-test-user.ts luther2030@gmail.com
 *   
 *   # Delete from production database (uses PROD_DATABASE_URL)
 *   pnpm exec dotenv -e .env -- tsx scripts/delete-test-user.ts luther2030@gmail.com --prod
 *   
 * Environment variables:
 *   - DATABASE_URL: Development database URL (default)
 *   - PROD_DATABASE_URL: Production database URL (used with --prod flag)
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const email = args.find(arg => !arg.startsWith("--"));
const isProd = args.includes("--prod");

if (!email) {
  console.error("❌ Error: Email address is required");
  console.error("Usage: tsx scripts/delete-test-user.ts <email> [--prod]");
  process.exit(1);
}

// Use PROD_DATABASE_URL if --prod flag is set, otherwise use DATABASE_URL
let dbUrl: string;
if (isProd) {
  dbUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!process.env.PROD_DATABASE_URL && process.env.DATABASE_URL) {
    console.warn("⚠️  WARNING: PROD_DATABASE_URL not set, using DATABASE_URL instead.");
  }
} else {
  dbUrl = process.env.DATABASE_URL || "";
}

if (!dbUrl || !dbUrl.startsWith("postgresql://")) {
  console.error("❌ Error: Database URL must be set and be a PostgreSQL connection string");
  process.exit(1);
}

// Determine if this looks like production database
const isProdDb = dbUrl.includes("neon") && !dbUrl.includes("dev");

// If --prod flag is set, verify we're using production database
if (isProd && !isProdDb) {
  console.error("❌ Error: --prod flag is set but database URL doesn't look like production");
  console.error("   Production databases typically contain 'neon' and not 'dev'");
  console.error(`   Current URL: ${dbUrl.substring(0, 50)}...`);
  process.exit(1);
}

// Set the database URL for Prisma
if (isProd && process.env.PROD_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

async function deleteUser() {
  const dbType = isProd ? "PRODUCTION" : "DEVELOPMENT";
  console.log(`🗑️  Deleting user from ${dbType} database...\n`);
  console.log(`📧 Email: ${email}\n`);

  try {
    await prisma.$connect();
    console.log("✅ Connected to database\n");

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        subscription: true,
        accounts: true,
      },
    });

    if (!user) {
      console.log("ℹ️  User not found. Nothing to delete.");
      return;
    }

    // Show what will be deleted
    console.log("📋 Found user:");
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.name || "N/A"}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Created: ${user.createdAt.toISOString()}`);
    console.log(`   Has password: ${user.password ? "Yes" : "No"}`);
    console.log(`   OAuth accounts: ${user.accounts.length}`);
    if (user.accounts.length > 0) {
      user.accounts.forEach((account) => {
        console.log(`     - ${account.provider} (${account.providerAccountId})`);
      });
    }
    console.log(`   Subscription: ${user.subscription ? "Yes" : "No"}`);
    if (user.subscription) {
      console.log(`     Plan: ${user.subscription.plan}`);
      console.log(`     Stripe Customer ID: ${user.subscription.stripeCustomerId || "N/A"}`);
      console.log(`     Stripe Subscription ID: ${user.subscription.stripeSubscriptionId || "N/A"}`);
      console.log(`     Valid Until: ${user.subscription.validUntil?.toISOString() || "N/A"}`);
    }

    // Confirm deletion (especially for production)
    if (isProd) {
      console.log("\n⚠️  WARNING: You are about to delete from PRODUCTION database!");
      console.log("   This will delete:");
      console.log("   - User account");
      console.log("   - All OAuth accounts");
      console.log("   - Subscription record");
      console.log("\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Delete the user (subscription and accounts will be cascade deleted)
    console.log("\n🗑️  Deleting user...");
    await prisma.user.delete({
      where: { id: user.id },
    });

    console.log("✅ User deleted successfully!");
    console.log(`   - User account deleted`);
    console.log(`   - ${user.accounts.length} OAuth account(s) deleted (cascade)`);
    console.log(`   - Subscription deleted (cascade)`);

  } catch (error) {
    console.error("❌ Error deleting user:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteUser()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Failed:", error);
    process.exit(1);
  });


