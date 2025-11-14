/**
 * Quick script to remove premium subscription for testing
 * Run with: tsx remove-premium.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function removePremium() {
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
      console.log("No premium subscriptions found.");
      return;
    }

    console.log(`Found ${premiumSubs.length} premium subscription(s):\n`);
    premiumSubs.forEach((sub, index) => {
      console.log(`${index + 1}. User: ${sub.user.email} (${sub.user.name || "No name"})`);
      console.log(`   Valid until: ${sub.validUntil || "N/A"}`);
    });

    // Remove all premium subscriptions (set to FREEMIUM)
    const result = await prisma.subscription.updateMany({
      where: {
        plan: "PREMIUM",
      },
      data: {
        plan: "FREEMIUM",
        validUntil: null,
      },
    });

    console.log(`\n✅ Removed premium from ${result.count} subscription(s).`);
  } catch (error: unknown) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

removePremium();

