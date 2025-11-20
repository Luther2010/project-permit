/**
 * Script to remove your own subscription for testing
 * 
 * Usage:
 *   pnpm exec dotenv -e .env -- tsx remove-my-subscription.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function removeMySubscription() {
  console.log("🔍 Removing your subscription...\n");

  try {
    // Find subscription by email
    const email = "luther2020@gmail.com";
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: { subscription: true },
    });

    if (!user) {
      console.log(`❌ User with email ${email} not found.`);
      return;
    }

    if (!user.subscription) {
      console.log(`✅ No subscription found for ${email}.`);
      return;
    }

    console.log(`Found subscription for ${email}:`);
    console.log(`  Plan: ${user.subscription.plan}`);
    console.log(`  Stripe Subscription ID: ${user.subscription.stripeSubscriptionId || "None"}`);
    console.log(`  Stripe Customer ID: ${user.subscription.stripeCustomerId || "None"}\n`);

    // Downgrade to FREEMIUM and clear Stripe IDs
    await prisma.subscription.update({
      where: { userId: user.id },
      data: {
        plan: "FREEMIUM",
        validUntil: null,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        updatedAt: new Date(),
      },
    });

    console.log(`✅ Subscription removed! You're now on FREEMIUM plan.`);
    console.log(`   You can now test the full subscription flow end-to-end.`);
  } catch (error: unknown) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removeMySubscription();

