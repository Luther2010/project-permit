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
                permitType?: string;
                city?: string;
                minValue?: number;
                maxValue?: number;
            },
            context: any
        ) => {
            const where: any = {};

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
            if (args.propertyType) {
                where.propertyType = args.propertyType;
            }
            if (args.permitType) {
                where.permitType = args.permitType;
            }
            if (args.city) {
                where.city = { contains: args.city };
            }
            if (args.minValue || args.maxValue) {
                where.value = {};
                if (args.minValue) where.value.gte = args.minValue;
                if (args.maxValue) where.value.lte = args.maxValue;
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
                        const subscription = user.subscription as any;
                        const validUntil = subscription.validUntil;

                        // User has premium access if:
                        // 1. Plan is PREMIUM AND validUntil is in the future (or null for lifetime)
                        // 2. OR validUntil is in the future (regardless of plan - handles trials)
                        isPremium =
                            (subscription.plan === "PREMIUM" &&
                                (validUntil === null || validUntil > now)) ||
                            (validUntil && validUntil > now);

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
