/**
 * Database connection for the scraper
 * Uses the Prisma client from the web app
 */

import { PrismaClient } from "@prisma/client";

// Use Prisma client from the web app's node_modules
// In a monorepo, both apps share the same generated client
let prismaClientInstance: PrismaClient | undefined;

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

if (!global.prisma) {
  global.prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

prismaClientInstance = global.prisma;

export const prisma = prismaClientInstance;


