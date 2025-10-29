import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export const resolvers = {
    Query: {
        permits: async (
            _: unknown,
            args: {
                query?: string;
                propertyType?: string;
                propertyTypes?: string[];
                permitType?: string;
                permitTypes?: string[];
                city?: string;
                minValue?: number;
                maxValue?: number;
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
                    { city: { contains: args.query } },
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
            if (args.city) {
                where.city = { contains: args.city };
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

            let isPremium = false;

            if (session?.user?.id) {
                try {
                    const user = await prisma.user.findUnique({
                        where: { id: session.user.id },
                        include: { subscription: true },
                    });

                    if (user?.subscription) {
                        const now = new Date();
                        const subscription = user.subscription as unknown as {
                            plan: string;
                            validUntil: Date | null;
                        };
                        const validUntil = subscription.validUntil;

                        // User has premium access if:
                        // 1. Plan is PREMIUM AND validUntil is in the future (or null for lifetime)
                        // 2. OR validUntil is in the future (regardless of plan - handles trials)
                        isPremium = Boolean(
                            (subscription.plan === "PREMIUM" &&
                                (validUntil === null || validUntil > now)) ||
                                (validUntil && validUntil > now)
                        );
                    }
                } catch (error) {
                    console.log("Error checking subscription:", error);
                }
            }

            // Apply freemium limit: 3 permits for freemium users, unlimited for premium
            const limit = isPremium ? undefined : 3;

            return await prisma.permit.findMany({
                where,
                orderBy: { issuedDate: "desc" },
                ...(limit ? { take: limit } : {}),
            });
        },

        permit: async (_: unknown, args: { id: string }) => {
            return await prisma.permit.findUnique({
                where: { id: args.id },
            });
        },

        permitByNumber: async (_: unknown, args: { permitNumber: string }) => {
            return await prisma.permit.findUnique({
                where: { permitNumber: args.permitNumber },
            });
        },
    },
};
