-- AlterTable
ALTER TABLE "Account" ADD COLUMN "access_token" TEXT;
ALTER TABLE "Account" ADD COLUMN "expires_at" INTEGER;
ALTER TABLE "Account" ADD COLUMN "id_token" TEXT;
ALTER TABLE "Account" ADD COLUMN "refresh_token" TEXT;
ALTER TABLE "Account" ADD COLUMN "scope" TEXT;
ALTER TABLE "Account" ADD COLUMN "session_state" TEXT;
ALTER TABLE "Account" ADD COLUMN "token_type" TEXT;
