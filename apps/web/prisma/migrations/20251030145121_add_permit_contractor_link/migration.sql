-- CreateTable
CREATE TABLE "PermitContractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "permitId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "role" TEXT,
    CONSTRAINT "PermitContractor_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PermitContractor_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PermitContractor_contractorId_idx" ON "PermitContractor"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "PermitContractor_permitId_contractorId_key" ON "PermitContractor"("permitId", "contractorId");
