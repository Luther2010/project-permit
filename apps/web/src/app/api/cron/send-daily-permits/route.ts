import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/ses-client";
import {
  generateDailyPermitsEmail,
  generateDailyPermitsEmailText,
} from "@/lib/email/templates/daily-permits";

/**
 * Cron job endpoint to send daily permits email to all premium users
 * 
 * Runs daily at 8 AM Pacific Time (15:00 UTC, configured in vercel.json)
 * Sends emails for permits applied on the previous day (Pacific Time)
 * Only sends if there are permits and user has active premium subscription
 */
export async function GET(request: Request) {
  // Verify this is a legitimate cron request
  // Vercel automatically adds 'x-vercel-cron' header when calling cron jobs
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  
  // Also allow manual testing with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  let isAuthorized = false;

  if (vercelCronHeader) {
    // This is a legitimate Vercel Cron request
    isAuthorized = true;
  } else if (cronSecret) {
    // Check for manual testing with CRON_SECRET
    const authHeader = request.headers.get("authorization");
    const cronHeader = request.headers.get("x-cron-secret");
    const url = new URL(request.url);
    const querySecret = url.searchParams.get("secret");

    // Accept secret from Authorization header, x-cron-secret header, or query parameter
    const providedSecret =
      authHeader?.replace("Bearer ", "") || cronHeader || querySecret;

    if (providedSecret === cronSecret) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized: This endpoint can only be called by Vercel Cron or with a valid secret" },
      { status: 401 }
    );
  }

  try {
    // Get yesterday's date in Pacific Time (America/Los_Angeles)
    // This ensures consistent behavior regardless of where the script runs
    const currentTime = new Date();
    
    // Format current date in Pacific Time to get the date components
    const pacificDateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    
    const parts = pacificDateFormatter.formatToParts(currentTime);
    const pacificYear = parseInt(parts.find(p => p.type === "year")!.value);
    const pacificMonth = parseInt(parts.find(p => p.type === "month")!.value);
    const pacificDay = parseInt(parts.find(p => p.type === "day")!.value);
    
    // Create a date object for today in Pacific Time (using UTC to avoid timezone shifts)
    // Then subtract one day
    const todayPacific = new Date(Date.UTC(pacificYear, pacificMonth - 1, pacificDay));
    const yesterdayPacific = new Date(todayPacific);
    yesterdayPacific.setUTCDate(yesterdayPacific.getUTCDate() - 1);

    const year = yesterdayPacific.getUTCFullYear();
    const month = yesterdayPacific.getUTCMonth() + 1;
    const day = yesterdayPacific.getUTCDate();

    // Format as YYYY-MM-DD for appliedDateString query (timezone-safe)
    const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    console.log(`[Cron] Processing daily permits email for ${dateString} (yesterday in Pacific Time)`);

    // Query permits applied yesterday using appliedDateString for timezone-safe filtering
    const permits = await prisma.permit.findMany({
      where: {
        appliedDateString: dateString,
      },
      orderBy: {
        appliedDateString: "desc",
      },
    });

    const permitCount = permits.length;
    console.log(`[Cron] Found ${permitCount} permit(s) for ${dateString}`);

    // If no permits, skip sending emails
    if (permitCount === 0) {
      console.log(`[Cron] No permits found. Skipping email send.`);
      return NextResponse.json({
        success: true,
        message: "No permits found for yesterday. No emails sent.",
        permitCount: 0,
        date: dateString,
      });
    }

    // Get all premium users with active subscriptions
    const currentDate = new Date();
    const premiumUsers = await prisma.user.findMany({
      where: {
        subscription: {
          plan: "PREMIUM",
          OR: [
            { validUntil: null }, // Lifetime premium
            { validUntil: { gt: currentDate } }, // Active premium (not expired)
          ],
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    console.log(`[Cron] Found ${premiumUsers.length} premium user(s)`);

    if (premiumUsers.length === 0) {
      console.log(`[Cron] No premium users found. Skipping email send.`);
      return NextResponse.json({
        success: true,
        message: "No premium users found. No emails sent.",
        permitCount,
        date: dateString,
        usersNotified: 0,
      });
    }

    // Format date for email (e.g., "October 27, 2025")
    const formattedDate = new Date(year, month - 1, day).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXTAUTH_URL ||
      "https://project-permit-web.vercel.app";

    // Generate email content (same for all users)
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

    // Send emails to all premium users
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const user of premiumUsers) {
      try {
        await sendEmail({
          to: user.email,
          subject: `New Permits - ${formattedDate} (${permitCount} permit${permitCount !== 1 ? "s" : ""})`,
          htmlBody,
          textBody,
        });
        results.success++;
        console.log(`[Cron] Email sent to ${user.email}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results.failed++;
        results.errors.push(`${user.email}: ${message}`);
        console.error(`[Cron] Failed to send email to ${user.email}:`, message);
      }
    }

    console.log(
      `[Cron] Completed: ${results.success} sent, ${results.failed} failed`
    );

    return NextResponse.json({
      success: true,
      message: `Processed daily permits email for ${dateString}`,
      permitCount,
      date: dateString,
      usersNotified: results.success,
      usersFailed: results.failed,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Cron] Error processing daily permits email:", message);
    return NextResponse.json(
      { error: `Failed to process daily permits email: ${message}` },
      { status: 500 }
    );
  }
}

