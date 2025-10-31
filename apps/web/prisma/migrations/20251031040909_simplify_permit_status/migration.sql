-- Map old PermitStatus enum values to new simplified values
-- DRAFT, SUBMITTED, IN_REVIEW, APPROVED -> IN_REVIEW
UPDATE "Permit" SET "status" = 'IN_REVIEW' WHERE "status" IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED');

-- ISSUED stays as ISSUED (no change needed)

-- EXPIRED, REVOKED, CANCELLED -> INACTIVE
UPDATE "Permit" SET "status" = 'INACTIVE' WHERE "status" IN ('EXPIRED', 'REVOKED', 'CANCELLED');