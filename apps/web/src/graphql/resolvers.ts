import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { sendEmail } from "@/lib/email/ses-client";
import { getClientIP, checkRateLimit, sanitizeInput } from "@/lib/rate-limit";

// Helper function to check if user is premium
async function checkIsPremium(session: {
    user?: {
        id: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
} | null | undefined): Promise<boolean> {
    if (!session?.user?.id) {
        return false;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { subscription: true },
        });

        if (user?.subscription) {
            // Webhooks correctly set plan to PREMIUM/FREEMIUM based on subscription status
            // All subscriptions have validUntil = null (Stripe manages expiration)
            // So we only need to check the plan
            return user.subscription.plan === "PREMIUM";
        }
    } catch (error) {
        console.log("Error checking subscription:", error);
    }

    return false;
}

export const resolvers = {
    Query: {
        me: async (
            _: unknown,
            __: unknown,
            context: {
                session?: {
                    user: {
                        id: string;
                        name?: string | null;
                        email?: string | null;
                        image?: string | null;
                    };
                } | null;
            }
        ) => {
            let session = context?.session;
            if (!session) {
                try {
                    session = await getServerSession(authOptions);
                } catch (error) {
                    console.log("Could not get session in resolver:", error);
                    return null;
                }
            }

            if (!session?.user?.id) {
                return null;
            }

            const isPremium = await checkIsPremium(session);

            return {
                id: session.user.id,
                email: session.user.email || "",
                name: session.user.name,
                isPremium,
            };
        },
        permits: async (
            _: unknown,
            args: {
                query?: string;
                propertyType?: string;
                propertyTypes?: string[];
                permitType?: string;
                permitTypes?: string[];
                statuses?: string[];
                cities?: string[];
                hasContractor?: boolean;
                minValue?: number;
                maxValue?: number;
                minAppliedDate?: string;
                maxAppliedDate?: string;
                minLastUpdateDate?: string;
                maxLastUpdateDate?: string;
                timezone?: string;
                page?: number;
                pageSize?: number;
                sortBy?: string;
                sortOrder?: string;
            },
            context: {
                session?: {
                    user: {
                        id: string;
                        name?: string | null;
                        email?: string | null;
                        image?: string | null;
                    };
                } | null;
            }
        ) => {
            const where: Record<string, unknown> = {};

            // Text search (if provided)
            if (args.query) {
                where.OR = [
                    { permitNumber: { contains: args.query } },
                    { title: { contains: args.query } },
                    { description: { contains: args.query } },
                    { address: { contains: args.query } },
                ];
            }

            // Structured filters
            // Support both single value (legacy) and array values (multi-select)
            if (args.propertyTypes && args.propertyTypes.length > 0) {
                where.propertyType = { in: args.propertyTypes };
            } else if (args.propertyType) {
                where.propertyType = args.propertyType;
            }
            if (args.permitTypes && args.permitTypes.length > 0) {
                where.permitType = { in: args.permitTypes };
            } else if (args.permitType) {
                where.permitType = args.permitType;
            }
            if (args.statuses && args.statuses.length > 0) {
                where.status = { in: args.statuses };
            }
            if (args.cities && args.cities.length > 0) {
                where.city = { in: args.cities };
            }
            if (typeof args.hasContractor === "boolean") {
                where.contractors = args.hasContractor
                    ? { some: {} }
                    : { none: {} };
            }
            if (args.minValue || args.maxValue) {
                where.value = {} as Record<string, unknown>;
                if (args.minValue)
                    (where.value as Record<string, unknown>).gte =
                        args.minValue;
                if (args.maxValue)
                    (where.value as Record<string, unknown>).lte =
                        args.maxValue;
            }
            if (args.minAppliedDate || args.maxAppliedDate) {
                where.appliedDate = {} as Record<string, unknown>;
                if (args.minAppliedDate) {
                    const minDate = new Date(args.minAppliedDate);
                    // Set to start of day
                    minDate.setHours(0, 0, 0, 0);
                    (where.appliedDate as Record<string, unknown>).gte = minDate;
                }
                if (args.maxAppliedDate) {
                    const maxDate = new Date(args.maxAppliedDate);
                    // Set to end of day
                    maxDate.setHours(23, 59, 59, 999);
                    (where.appliedDate as Record<string, unknown>).lte = maxDate;
                }
            }
            if (args.minLastUpdateDate || args.maxLastUpdateDate) {
                where.updatedAt = {} as Record<string, unknown>;
                // Use user's timezone if provided, otherwise default to UTC
                const timezone = args.timezone || "UTC";
                
                // Helper function to convert a date string (YYYY-MM-DD) to UTC Date
                // representing start/end of day in the specified timezone
                const getDateInTimezone = (
                    dateStr: string,
                    isEndOfDay: boolean
                ): Date => {
                    const [year, month, day] = dateStr.split("-").map(Number);
                    const hour = isEndOfDay ? 23 : 0;
                    const minute = isEndOfDay ? 59 : 0;
                    const second = isEndOfDay ? 59 : 0;
                    const ms = isEndOfDay ? 999 : 0;
                    
                    // Calculate timezone offset for this specific date
                    // Use a representative time (noon) to avoid DST edge cases at midnight
                    const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
                    // Format in target timezone and UTC, then compare to get offset
                    const tzFormatted = testDate.toLocaleString("en-US", {
                        timeZone: timezone,
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                    });
                    const utcFormatted = testDate.toLocaleString("en-US", {
                        timeZone: "UTC",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                    });
                    
                    // Parse both to get the actual time difference
                    const tzDate = new Date(tzFormatted);
                    const utcDate = new Date(utcFormatted);
                    const offsetMs = utcDate.getTime() - tzDate.getTime();
                    
                    // Create UTC date for the start/end of day, then adjust by offset
                    const utcResult = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
                    return new Date(utcResult.getTime() - offsetMs);
                };
                
                if (args.minLastUpdateDate) {
                    const minDateUTC = getDateInTimezone(args.minLastUpdateDate, false);
                    (where.updatedAt as Record<string, unknown>).gte = minDateUTC;
                }
                if (args.maxLastUpdateDate) {
                    const maxDateUTC = getDateInTimezone(args.maxLastUpdateDate, true);
                    (where.updatedAt as Record<string, unknown>).lte = maxDateUTC;
                }
            }

            // Get user's subscription status
            // Try to get session from context first, then fallback to getServerSession
            let session = context?.session;
            if (!session) {
                try {
                    session = await getServerSession(authOptions);
                } catch (error) {
                    console.log("Could not get session in resolver:", error);
                }
            }

            const isPremium = await checkIsPremium(session);

            // Pagination settings
            const page = args.page && args.page > 0 ? args.page : 1;
            const pageSize =
                args.pageSize && args.pageSize > 0 ? args.pageSize : 10;

            // Apply freemium limit: 3 permits for freemium users, unlimited for premium
            const freemiumLimit = isPremium ? undefined : 3;

            // Get total count before pagination
            const totalCount = await prisma.permit.count({ where });

            // Apply freemium limit to total count for freemium users
            const effectiveTotalCount = isPremium
                ? totalCount
                : Math.min(totalCount, freemiumLimit || Infinity);

            // Calculate skip, but cap it at the effective total count
            const requestedSkip = (page - 1) * pageSize;
            const skip = Math.min(requestedSkip, effectiveTotalCount);

            // Calculate take, ensuring we don't exceed the remaining items or freemium limit
            const remainingItems = effectiveTotalCount - skip;
            const effectiveLimit = freemiumLimit
                ? Math.min(pageSize, remainingItems, freemiumLimit)
                : Math.min(pageSize, remainingItems);

            // Build orderBy clause based on sort parameters
            let orderBy: Record<string, string> = { appliedDate: "desc" }; // Default sort
            if (args.sortBy) {
                const sortFieldMap: Record<string, string> = {
                    PERMIT_TYPE: "permitType",
                    PROPERTY_TYPE: "propertyType",
                    CITY: "city",
                    VALUE: "value",
                    APPLIED_DATE: "appliedDate",
                    STATUS: "status",
                };
                const prismaField = sortFieldMap[args.sortBy];
                if (prismaField) {
                    const sortOrder = args.sortOrder === "ASC" ? "asc" : "desc";
                    orderBy = { [prismaField]: sortOrder };
                }
            }

            // Fetch paginated results
            const permits = await prisma.permit.findMany({
                where,
                orderBy,
                skip,
                take: effectiveLimit,
                include: {
                    contractors: {
                        include: {
                            contractor: {
                                include: { classifications: true },
                            },
                        },
                    },
                },
            });

            const hasNextPage = skip + effectiveLimit < effectiveTotalCount;
            const hasPreviousPage = page > 1;

            return {
                permits,
                totalCount: effectiveTotalCount,
                page,
                pageSize: pageSize, // Return original pageSize, not effectiveLimit
                hasNextPage,
                hasPreviousPage,
            };
        },

        permit: async (_: unknown, args: { id: string }) => {
            return await prisma.permit.findUnique({
                where: { id: args.id },
                include: {
                    contractors: {
                        include: {
                            contractor: {
                                include: { classifications: true },
                            },
                        },
                    },
                },
            });
        },

        permitByNumber: async (_: unknown, args: { permitNumber: string }) => {
            return await prisma.permit.findUnique({
                where: { permitNumber: args.permitNumber },
                include: {
                    contractors: {
                        include: {
                            contractor: {
                                include: { classifications: true },
                            },
                        },
                    },
                },
            });
        },
        activeFeatures: async () => {
            const features = await prisma.featureOption.findMany({
                where: { status: "ACTIVE" },
                include: {
                    _count: {
                        select: { votes: true },
                    },
                },
                orderBy: {
                    createdAt: "asc",
                },
            });

            return features.map((feature) => ({
                id: feature.id,
                title: feature.title,
                description: feature.description,
                status: feature.status,
                voteCount: feature._count.votes,
            }));
        },
    },
    Mutation: {
        submitContactForm: async (
            _: unknown,
            args: { name: string; email: string; message: string },
            context: {
                session?: {
                    user: {
                        id: string;
                        name?: string | null;
                        email?: string | null;
                        image?: string | null;
                    };
                } | null;
                request?: Request;
            }
        ) => {
            // Get client IP for rate limiting
            const httpRequest = context.request;
            if (!httpRequest) {
                throw new Error("Request not available in context");
            }

            const ip = getClientIP(httpRequest);

            // Check rate limit
            const rateLimitResult = checkRateLimit(ip);
            if (!rateLimitResult.allowed) {
                const resetAt = rateLimitResult.resetAt;
                const retryAfter = resetAt
                    ? Math.ceil((resetAt.getTime() - Date.now()) / 1000)
                    : 3600;

                throw new Error(
                    `Too many requests. Please try again after ${Math.ceil(
                        retryAfter / 60
                    )} minutes.`
                );
            }

            // Validate and sanitize input
            const sanitizedName = sanitizeInput(args.name, 100);
            const sanitizedEmail = sanitizeInput(args.email, 254);
            const sanitizedMessage = sanitizeInput(args.message, 5000);

            // Validation
            if (!sanitizedName) {
                throw new Error("Name is required.");
            }

            if (!sanitizedEmail) {
                throw new Error("Email is required.");
            }

            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(sanitizedEmail)) {
                throw new Error("Invalid email format.");
            }

            if (!sanitizedMessage) {
                throw new Error("Message is required.");
            }

            if (sanitizedMessage.length < 10) {
                throw new Error("Message is too short (min 10 characters).");
            }

            // Get admin email from environment
            const adminEmail =
                process.env.CONTACT_ADMIN_EMAIL || process.env.SES_FROM_EMAIL;
            if (!adminEmail) {
                console.error(
                    "CONTACT_ADMIN_EMAIL or SES_FROM_EMAIL environment variable is not set"
                );
                throw new Error("Contact form is not configured");
            }

            // Prepare email content
            const subject = `New Contact Form Submission from ${sanitizedName}`;
            const timestamp = new Date().toLocaleString("en-US", {
                timeZone: "America/Los_Angeles",
                dateStyle: "long",
                timeStyle: "short",
            });

            const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
            New Contact Form Submission
        </h2>
        
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Name:</strong> ${sanitizedName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${sanitizedEmail}">${sanitizedEmail}</a></p>
            <p style="margin: 5px 0;"><strong>Submitted:</strong> ${timestamp}</p>
        </div>
        
        <div style="margin: 20px 0;">
            <h3 style="color: #374151; margin-bottom: 10px;">Message:</h3>
            <div style="background-color: #ffffff; padding: 15px; border-left: 4px solid #2563eb; white-space: pre-wrap;">
${sanitizedMessage.replace(/\n/g, "<br>")}
            </div>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
            <p>This email was sent from the PermitPulse contact form.</p>
            <p>You can reply directly to this email to respond to ${sanitizedName}.</p>
        </div>
    </div>
</body>
</html>
            `.trim();

            const textBody = `
New Contact Form Submission

Name: ${sanitizedName}
Email: ${sanitizedEmail}
Submitted: ${timestamp}

Message:
${sanitizedMessage}

---
This email was sent from the PermitPulse contact form.
You can reply directly to this email to respond to ${sanitizedName}.
            `.trim();

            // Send email
            await sendEmail({
                to: adminEmail,
                subject,
                htmlBody,
                textBody,
            });

            // Return success response
            return {
                message: "Thank you for contacting us! We'll get back to you soon.",
            };
        },
        submitFeatureVotes: async (
            _: unknown,
            args: { email: string; featureOptionIds: string[] }
        ) => {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(args.email)) {
                throw new Error("Invalid email format.");
            }

            // Validate that feature option IDs are provided
            if (!args.featureOptionIds || args.featureOptionIds.length === 0) {
                throw new Error("At least one feature option must be selected.");
            }

            // Check if user has voted within the last 7 days
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const recentVote = await prisma.featureVote.findFirst({
                where: {
                    email: args.email,
                    createdAt: {
                        gte: oneWeekAgo,
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            if (recentVote) {
                const daysRemaining = Math.ceil(
                    (7 * 24 * 60 * 60 * 1000 -
                        (Date.now() - recentVote.createdAt.getTime())) /
                        (24 * 60 * 60 * 1000)
                );
                throw new Error(
                    `You can only vote once per week. Please try again in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}.`
                );
            }

            // Validate that all feature options exist and are ACTIVE
            const featureOptions = await prisma.featureOption.findMany({
                where: {
                    id: { in: args.featureOptionIds },
                    status: "ACTIVE",
                },
            });

            if (featureOptions.length !== args.featureOptionIds.length) {
                throw new Error(
                    "One or more selected features are invalid or not active."
                );
            }

            // Use a transaction to ensure all votes are created atomically
            await prisma.$transaction(async (tx) => {
                // Delete ALL existing votes for this email
                // This ensures users can update their votes completely
                await tx.featureVote.deleteMany({
                    where: {
                        email: args.email,
                    },
                });

                // Create new votes for selected features
                if (args.featureOptionIds.length > 0) {
                    await tx.featureVote.createMany({
                        data: args.featureOptionIds.map((featureOptionId) => ({
                            email: args.email,
                            featureOptionId,
                        })),
                        skipDuplicates: true, // In case of race conditions
                    });
                }
            });

            return {
                success: true,
                message: `Successfully submitted ${args.featureOptionIds.length} vote(s)!`,
            };
        },
    },
};
