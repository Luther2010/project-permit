/**
 * Script to remove premium subscriptions for testing
 * 
 * Usage:
 *   # Remove from dev database (default, uses DATABASE_URL)
 *   pnpm exec dotenv -e .env -- tsx remove-premium.ts
 *   
 *   # Remove from production database (uses PROD_DATABASE_URL)
 *   pnpm exec dotenv -e .env -- tsx remove-premium.ts --prod
 *   
 * Environment variables:
 *   - DATABASE_URL: Development database URL (default)
 *   - PROD_DATABASE_URL: Production database URL (used with --prod flag)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function removePremium() {
  // Check if --prod flag is set
  const isProd = process.argv.includes("--prod");
  
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
  
  // Set the database URL for Prisma
  if (isProd && process.env.PROD_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
  }
  
  // Determine if this looks like production database
  const isProdDb = dbUrl.includes("neon") && !dbUrl.includes("dev");
  
  // If --prod flag is set, verify we're using production database
  if (isProd) {
    if (!dbUrl) {
      console.error("❌ ERROR: No database URL found!");
      console.error("   Please set PROD_DATABASE_URL or DATABASE_URL for production.");
      process.exit(1);
    }
    if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") || dbUrl.includes("dev")) {
      console.error("❌ ERROR: --prod flag set but database URL appears to be dev/local!");
      console.error("   Please set PROD_DATABASE_URL to your production database URL.");
      process.exit(1);
    }
    if (!isProdDb) {
      console.warn("⚠️  WARNING: Database URL doesn't look like production.");
      console.warn("   Are you sure you want to continue? (This will modify PRODUCTION database)");
      console.warn("   Waiting 3 seconds... Press Ctrl+C to cancel.\n");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  const target = isProd ? "PRODUCTION" : "development";
  console.log(`🔍 Searching for premium subscriptions in ${target} database...\n`);

  try {
    // Get all premium subscriptions
    const premiumSubs = await prisma.subscription.findMany({
      where: {
        plan: "PREMIUM",
      },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (premiumSubs.length === 0) {
      console.log(`✅ No premium subscriptions found in ${target} database.`);
      return;
    }

    console.log(`Found ${premiumSubs.length} premium subscription(s) in ${target}:\n`);
    premiumSubs.forEach((sub, index) => {
      console.log(`${index + 1}. User: ${sub.user.email} (${sub.user.name || "No name"})`);
      console.log(`   Valid until: ${sub.validUntil || "N/A"}`);
      // Only show stripeSubscriptionId if it exists in the schema
      if ("stripeSubscriptionId" in sub) {
        const subWithStripe = sub as typeof sub & { stripeSubscriptionId?: string | null };
        console.log(`   Stripe Subscription ID: ${subWithStripe.stripeSubscriptionId || "None"}`);
      }
    });

    if (isProd) {
      console.log("\n⚠️  WARNING: This will remove premium access from PRODUCTION database!");
      console.log("   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Remove all premium subscriptions (set to FREEMIUM)
    // Note: Production DB might not have stripeSubscriptionId/stripeCustomerId fields yet
    // So we only update plan and validUntil which exist in both old and new schemas
    let count = 0;
    for (const sub of premiumSubs) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: "FREEMIUM",
          validUntil: null,
          // Only update stripeSubscriptionId if the field exists in the schema
          // (will be ignored if field doesn't exist)
          ...("stripeSubscriptionId" in sub ? { stripeSubscriptionId: null } : {}),
        },
      });
      count++;
    }

    console.log(`\n✅ Removed premium from ${count} subscription(s) in ${target} database.`);
    if (isProd) {
      console.log("   These users will need to subscribe again to regain premium access.");
    }
  } catch (error: unknown) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removePremium();

