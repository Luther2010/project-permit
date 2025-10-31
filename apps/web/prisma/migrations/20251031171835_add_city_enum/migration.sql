-- Convert city string values to City enum values
-- SQLite doesn't support enums natively, but we'll store them as TEXT
-- and Prisma will validate them at the application level

-- First, update existing city values to match enum format
UPDATE "Permit" SET "city" = 
  CASE 
    WHEN "city" = 'Los Gatos' OR "city" = 'LOS GATOS' THEN 'LOS_GATOS'
    WHEN "city" = 'Saratoga' THEN 'SARATOGA'
    WHEN "city" = 'Santa Clara' OR "city" = 'SANTA CLARA' THEN 'SANTA_CLARA'
    WHEN "city" = 'Cupertino' THEN 'CUPERTINO'
    WHEN "city" = 'Palo Alto' OR "city" = 'PALO ALTO' THEN 'PALO_ALTO'
    ELSE NULL
  END
WHERE "city" IS NOT NULL;

-- Note: The actual enum constraint is enforced by Prisma Client at runtime
-- SQLite will store these as TEXT values, which is fine
