import { prisma } from "@/lib/db";

export const resolvers = {
    Query: {
        permits: async () => {
            return await prisma.permit.findMany({
                orderBy: { issuedDate: "desc" },
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

        searchPermits: async (_: unknown, args: { query?: string }) => {
            if (!args.query) {
                return await prisma.permit.findMany({
                    orderBy: { issuedDate: "desc" },
                });
            }

            return await prisma.permit.findMany({
                where: {
                    OR: [
                        { permitNumber: { contains: args.query } },
                        { title: { contains: args.query } },
                        { description: { contains: args.query } },
                        { city: { contains: args.query } },
                        { address: { contains: args.query } },
                    ],
                },
                orderBy: { issuedDate: "desc" },
            });
        },
    },
};
