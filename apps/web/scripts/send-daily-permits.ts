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

  // Parse date and create date range for the day
  // Use UTC to match how dates are stored in the database
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid date value");
  }

  // Set to start of day (00:00:00) in UTC
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  // Set to end of day (23:59:59.999) in UTC
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  console.log(`Querying permits for date: ${date}`);
  console.log(`Date range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

  // Query permits applied on the specified date
  const permits = await prisma.permit.findMany({
    where: {
      appliedDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: {
      appliedDate: "desc",
    },
  });

  const permitCount = permits.length;
  console.log(`Found ${permitCount} permit(s) for ${date}`);

  if (permitCount === 0) {
    console.log("No permits found. Email will not be sent.");
    return;
  }

  // Format date for email (e.g., "October 27, 2025")
  // Use the parsed date components to create a local date for formatting
  const formattedDate = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "https://project-permit-web.vercel.app";

  // Generate email content
  const htmlBody = generateDailyPermitsEmail({
    date: formattedDate,
    permitCount,
    permits,
    baseUrl,
  });

  const textBody = generateDailyPermitsEmailText({
    date: formattedDate,
    permitCount,
    permits,
    baseUrl,
  });

  // Send email
  console.log(`Sending email to ${to}...`);
  await sendEmail({
    to,
    subject: `New Permits - ${formattedDate} (${permitCount} permit${permitCount !== 1 ? "s" : ""})`,
    htmlBody,
    textBody,
  });

  console.log(`✅ Email sent successfully to ${to}`);
  console.log(`   Date: ${formattedDate}`);
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

