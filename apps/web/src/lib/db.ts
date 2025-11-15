import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Log database URL (masked) for debugging in production
if (process.env.NODE_ENV === 'production' && typeof process.env.DATABASE_URL === 'string') {
  const dbUrl = process.env.DATABASE_URL;
  // Mask the password but show enough to identify the database
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
  console.log('[DB] Connecting to:', maskedUrl);
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

