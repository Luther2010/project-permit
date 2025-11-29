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
 * Sends emails for permits applied 2 days ago (the day before yesterday)
 * This is because permits applied on day N become available/scraped on day N+1,
 * so when the email runs on day N+2, it should send permits from day N
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
    // Compute a rolling 7-day window in Pacific Time (America/Los_Angeles)
    // Window: [today - 6 days, today] inclusive (last 7 days including today)
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
    
    // Create a date object for "today" in Pacific Time (using UTC to avoid timezone shifts)
    const todayPacific = new Date(
      Date.UTC(pacificYear, pacificMonth - 1, pacificDay)
    );

    // End of window: today in Pacific time
    const maxDate = new Date(todayPacific);

    // Start of window: 6 days before max (7 days total, inclusive)
    const minDate = new Date(maxDate);
    minDate.setUTCDate(minDate.getUTCDate() - 6);

    const minYear = minDate.getUTCFullYear();
    const minMonth = minDate.getUTCMonth() + 1;
    const minDay = minDate.getUTCDate();
    const maxYear = maxDate.getUTCFullYear();
    const maxMonth = maxDate.getUTCMonth() + 1;
    const maxDay = maxDate.getUTCDate();

    // Format as YYYY-MM-DD for appliedDateString query (timezone-safe)
    const minDateString = `${minYear}-${String(minMonth).padStart(2, "0")}-${String(minDay).padStart(2, "0")}`;
    const maxDateString = `${maxYear}-${String(maxMonth).padStart(2, "0")}-${String(maxDay).padStart(2, "0")}`;
    console.log(
      `[Cron] Processing daily permits email for permits applied between ${minDateString} and ${maxDateString} (last 7 days including today, Pacific Time)`
    );

    // Query permits applied in the last 7 days window (most recent permits that have been scraped)
    // Get total count and city breakdown
    const [permitCount, cityCounts] = await Promise.all([
      prisma.permit.count({
        where: {
          appliedDateString: {
            gte: minDateString,
            lte: maxDateString,
          },
        },
      }),
      prisma.permit.groupBy({
        by: ['city'],
        where: {
          appliedDateString: {
            gte: minDateString,
            lte: maxDateString,
          },
        },
        _count: {
          id: true,
        },
      }),
    ]);
    console.log(`[Cron] Found ${permitCount} permit(s) for dates between ${minDateString} and ${maxDateString}`);

    // If no permits, skip sending emails
    if (permitCount === 0) {
      console.log(`[Cron] No permits found. Skipping email send.`);
      return NextResponse.json({
        success: true,
        message: `No permits found for dates between ${minDateString} and ${maxDateString}. No emails sent.`,
        permitCount: 0,
        date: maxDateString,
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
        date: maxDateString,
        usersNotified: 0,
      });
    }

    // Format date range for email subject/body, e.g. "Nov 22–Nov 28, 2025"
    const formattedStart = new Date(
      minYear,
      minMonth - 1,
      minDay
    ).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const formattedEnd = new Date(
      maxYear,
      maxMonth - 1,
      maxDay
    ).toLocaleDateString("en-US", {
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

    // Generate email content (same for all users)
    const htmlBody = generateDailyPermitsEmail({
      date: formattedRange,
      minDateString,
      maxDateString,
      permitCount,
      cityCounts: cityCountMap,
      baseUrl,
    });

    const textBody = generateDailyPermitsEmailText({
      date: formattedRange,
      minDateString,
      maxDateString,
      permitCount,
      cityCounts: cityCountMap,
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
          subject: `New Permits - ${formattedRange} (${permitCount} permit${permitCount !== 1 ? "s" : ""})`,
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
      message: `Processed daily permits email for dates between ${minDateString} and ${maxDateString}`,
      permitCount,
      date: maxDateString,
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

