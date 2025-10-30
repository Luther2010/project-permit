-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licenseNo" TEXT NOT NULL,
    "name" TEXT,
    "mailingAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "businessType" TEXT,
    "issueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContractorClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractorId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    CONSTRAINT "ContractorClassification_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_licenseNo_key" ON "Contractor"("licenseNo");

-- CreateIndex
CREATE INDEX "Contractor_licenseNo_idx" ON "Contractor"("licenseNo");

-- CreateIndex
CREATE INDEX "Contractor_city_idx" ON "Contractor"("city");

-- CreateIndex
CREATE INDEX "ContractorClassification_classification_idx" ON "ContractorClassification"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorClassification_contractorId_classification_key" ON "ContractorClassification"("contractorId", "classification");
