/**
 * Script to send daily permits email for a specific date
 * 
 * Usage:
 *   pnpm exec dotenv -e .env -- tsx scripts/send-daily-permits.ts <email> <date>
 * 
 * Example:
 *   pnpm exec dotenv -e .env -- tsx scripts/send-daily-permits.ts user@example.com 2025-10-27
 */

import { prisma } from "../src/lib/db";
import { sendEmail } from "../src/lib/email/ses-client";
import {
  generateDailyPermitsEmail,
  generateDailyPermitsEmailText,
} from "../src/lib/email/templates/daily-permits";

async function sendDailyPermitsEmail(to: string, date: string) {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    throw new Error("Invalid email address format");
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD");
  }

  // Reference date (end of range) in YYYY-MM-DD
  const endDateString = date; // Already validated above

  // Compute start date string for the past week (7 days, inclusive)
  const [year, month, day] = endDateString.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid date value");
  }

  const endDate = new Date(year, month - 1, day);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6); // past 7 days: start + ... + end

  const formatDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const startDateString = formatDateString(startDate);

  console.log(`Querying permits for date range: ${startDateString} to ${endDateString}`);

  // Query permits applied in the specified date range using appliedDateString
  // Get total count and city breakdown
  const [permitCount, cityCounts] = await Promise.all([
    prisma.permit.count({
      where: {
        appliedDateString: {
          gte: startDateString,
          lte: endDateString,
        },
      },
    }),
    prisma.permit.groupBy({
      by: ['city'],
      where: {
        appliedDateString: {
          gte: startDateString,
          lte: endDateString,
        },
      },
      _count: {
        id: true,
      },
    }),
  ]);

  console.log(`Found ${permitCount} permit(s) for ${startDateString} to ${endDateString}`);

  if (permitCount === 0) {
    console.log("No permits found in range. Email will not be sent.");
    return;
  }

  // Format date range for email subject/body (e.g., "Nov 21–27, 2025")
  const formattedStart = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const formattedEnd = endDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedRange = `${formattedStart}–${formattedEnd}`;

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "https://project-permit-web.vercel.app";

  // Convert city counts to a map for easy lookup
  const cityCountMap = new Map<string | null, number>(
    cityCounts.map((item) => [item.city, item._count.id])
  );

  // Generate email content
  const htmlBody = generateDailyPermitsEmail({
    date: formattedRange,
    minDateString: startDateString,
    maxDateString: endDateString,
    permitCount,
    cityCounts: cityCountMap,
    baseUrl,
  });

  const textBody = generateDailyPermitsEmailText({
    date: formattedRange,
    minDateString: startDateString,
    maxDateString: endDateString,
    permitCount,
    cityCounts: cityCountMap,
    baseUrl,
  });

  // Send email
  console.log(`Sending email to ${to}...`);
  await sendEmail({
    to,
    subject: `New Permits - ${formattedRange} (${permitCount} permit${permitCount !== 1 ? "s" : ""})`,
    htmlBody,
    textBody,
  });

  console.log(`✅ Email sent successfully to ${to}`);
  console.log(`   Date range: ${formattedRange}`);
  console.log(`   Permits: ${permitCount}`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error("Usage: tsx scripts/send-daily-permits.ts <email> <date>");
    console.error("Example: tsx scripts/send-daily-permits.ts user@example.com 2025-10-27");
    process.exit(1);
  }

  const [email, date] = args;

  try {
    await sendDailyPermitsEmail(email, date);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Error:", message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

