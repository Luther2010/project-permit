# Data Migration Steps: SQLite → PostgreSQL

## Two-Step Process

### Step 1: Export from SQLite

1. **Temporarily change schema** (`apps/web/prisma/schema.prisma`):
   ```prisma
   datasource db {
     provider = "sqlite"  // Change from "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. **Generate Prisma client**:
   ```bash
   cd apps/web
   pnpm prisma generate
   ```

3. **Set OLD_DATABASE_URL** (in `.env` or export):
   ```bash
   export OLD_DATABASE_URL="file:./prisma/dev.db"
   # Or set in .env file
   ```

4. **Export data**:
   ```bash
   pnpm export-sqlite
   ```
   This creates `sqlite-export.json` in the `apps/web` directory.

5. **Change schema back** (`apps/web/prisma/schema.prisma`):
   ```prisma
   datasource db {
     provider = "postgresql"  // Change back to "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

6. **Regenerate Prisma client**:
   ```bash
   pnpm prisma generate
   ```

### Step 2: Import to PostgreSQL

1. **Make sure DATABASE_URL** is set to your PostgreSQL connection string in `.env`

2. **Run migration on PostgreSQL** (if not done already):
   ```bash
   pnpm prisma migrate dev --name migrate_to_postgresql
   ```

3. **Import data**:
   ```bash
   pnpm import-postgres
   ```

## Quick Commands

```bash
# Full migration process
cd apps/web

# Step 1: Export (with schema temporarily set to sqlite)
pnpm export-sqlite

# Step 2: Import (with schema set back to postgresql)
pnpm import-postgres
```

## What Gets Migrated

- ✅ All contractors (with classifications)
- ✅ All users (with accounts and subscriptions)
- ✅ All permits (with contractor links)

## Notes

- The export creates a JSON file that you can review before importing
- The import uses `upsert` so it won't create duplicates if run multiple times
- Make sure to change the schema back to `postgresql` after exporting!
