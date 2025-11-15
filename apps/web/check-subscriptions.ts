/**
 * Script to check all subscriptions in database
 * 
 * Usage:
 *   # Check dev database (default)
 *   pnpm exec dotenv -e .env -- tsx check-subscriptions.ts
 *   
 *   # Check production database
 *   pnpm exec dotenv -e .env -- tsx check-subscriptions.ts --prod
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkSubscriptions() {
  const isProd = process.argv.includes("--prod");
  const target = isProd ? "PRODUCTION" : "development";
  
  console.log(`🔍 Checking subscriptions in ${target} database...\n`);

  try {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (subscriptions.length === 0) {
      console.log("✅ No subscriptions found.");
      return;
    }

    console.log(`Found ${subscriptions.length} subscription(s):\n`);
    subscriptions.forEach((sub, index) => {
      console.log(`${index + 1}. Subscription ID: ${sub.id}`);
      console.log(`   User ID: ${sub.userId}`);
      console.log(`   User: ${sub.user.email} (${sub.user.name || "No name"})`);
      console.log(`   Plan: ${sub.plan}`);
      console.log(`   Valid Until: ${sub.validUntil || "null"}`);
      console.log(`   Stripe Subscription ID: ${sub.stripeSubscriptionId || "null"}`);
      console.log(`   Stripe Customer ID: ${sub.stripeCustomerId || "null"}`);
      console.log(`   Created: ${sub.createdAt}`);
      console.log(`   Updated: ${sub.updatedAt}`);
      console.log("");
    });
  } catch (error: unknown) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkSubscriptions();

