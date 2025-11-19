-- CreateEnum
CREATE TYPE "FeatureStatus" AS ENUM ('ACTIVE', 'IMPLEMENTED');

-- CreateTable
CREATE TABLE "FeatureOption" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "FeatureStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureVote" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "featureOptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureOption_status_idx" ON "FeatureOption"("status");

-- CreateIndex
CREATE INDEX "FeatureVote_email_idx" ON "FeatureVote"("email");

-- CreateIndex
CREATE INDEX "FeatureVote_featureOptionId_idx" ON "FeatureVote"("featureOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureVote_email_featureOptionId_key" ON "FeatureVote"("email", "featureOptionId");

-- AddForeignKey
ALTER TABLE "FeatureVote" ADD CONSTRAINT "FeatureVote_featureOptionId_fkey" FOREIGN KEY ("featureOptionId") REFERENCES "FeatureOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

