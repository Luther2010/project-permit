import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

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
            const now = new Date();
            const subscription = user.subscription as unknown as {
                plan: string;
                validUntil: Date | null;
            };
            const validUntil = subscription.validUntil;

            // User has premium access if:
            // Plan is PREMIUM AND validUntil is in the future (or null for lifetime)
            return Boolean(
                subscription.plan === "PREMIUM" &&
                    (validUntil === null || validUntil > now)
            );
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
    },
};
