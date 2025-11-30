-- Drop the existing unique constraint on permitNumber
ALTER TABLE "Permit" DROP CONSTRAINT IF EXISTS "Permit_permitNumber_key";

-- Add composite unique constraint on (permitNumber, city)
-- This allows the same permit number to exist in different cities
-- Using ALTER TABLE ADD CONSTRAINT for Prisma compatibility
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_permitNumber_city_key" UNIQUE ("permitNumber", "city");

