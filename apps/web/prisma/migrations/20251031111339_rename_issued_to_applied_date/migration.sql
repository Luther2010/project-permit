-- Rename issuedDate to appliedDate and issuedDateString to appliedDateString
-- SQLite doesn't support column renaming directly, so we need to recreate the table

-- Create new table with renamed columns
CREATE TABLE "Permit_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "permitNumber" TEXT NOT NULL UNIQUE,
    "title" TEXT,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "propertyType" TEXT,
    "permitType" TEXT,
    "status" TEXT,
    "value" REAL,
    "appliedDate" DATETIME,
    "appliedDateString" TEXT,
    "expirationDate" DATETIME,
    "sourceUrl" TEXT,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table to new table
INSERT INTO "Permit_new" (
    "id", "permitNumber", "title", "description", "address", "city", "state", "zipCode",
    "propertyType", "permitType", "status", "value",
    "appliedDate", "appliedDateString", "expirationDate",
    "sourceUrl", "scrapedAt", "createdAt", "updatedAt"
)
SELECT 
    "id", "permitNumber", "title", "description", "address", "city", "state", "zipCode",
    "propertyType", "permitType", "status", "value",
    "issuedDate", "issuedDateString", "expirationDate",
    "sourceUrl", "scrapedAt", "createdAt", "updatedAt"
FROM "Permit";

-- Drop old table
DROP TABLE "Permit";

-- Rename new table to original name
ALTER TABLE "Permit_new" RENAME TO "Permit";

-- Recreate indexes
CREATE INDEX "Permit_permitNumber_idx" ON "Permit"("permitNumber");
CREATE INDEX "Permit_city_idx" ON "Permit"("city");
CREATE INDEX "Permit_permitType_idx" ON "Permit"("permitType");
CREATE INDEX "Permit_appliedDate_idx" ON "Permit"("appliedDate");
