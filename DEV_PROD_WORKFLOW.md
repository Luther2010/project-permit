# Development → Production Workflow

## Overview

This guide explains how to set up separate development and production databases, scrape locally, verify changes, and sync to production.

## Setup: Separate Databases

### Step 1: Create a Development Database

1. **Create a new Neon database** (or use another PostgreSQL provider):
   - Go to https://neon.tech and sign in
   - Click "Create Project" or select an existing project
   - Click "Create Branch" to create a new database branch (or use the main branch)
   - Click on your database branch
   - In the dashboard, look for the "Connection Details" section
   - You'll see a connection string that looks like:
     ```
     postgresql://username:password@ep-xxxxx.us-east-1.aws.neon.tech/dbname?sslmode=require
     ```
   - Click "Copy" to copy the connection string
   - **Note**: You can also find this in the "Connection String" tab in Neon dashboard

2. **Update your local `.env`**:
   ```bash
   # Development database (for local scraping/testing)
   DATABASE_URL="postgresql://user:pass@host/db-dev?sslmode=require"
   
   # Production database (for syncing)
   PROD_DATABASE_URL="postgresql://user:pass@host/db-prod?sslmode=require"
   ```

3. **Keep Vercel environment variables** pointing to production:
   - `DATABASE_URL` = Production database connection string

### Step 2: Set Up Development Database Schema

```bash
cd apps/web

# Point to dev DB
export DATABASE_URL="<your-dev-db-url>"

# Create schema
pnpm prisma db push

# Or run migrations
pnpm prisma migrate dev
```

## Workflow: Local Scrape → Verify → Sync to Prod

### 1. Scrape Locally (Populates Dev DB)

```bash
cd apps/scraper

# Make sure DATABASE_URL points to dev DB in .env
# Or override it:
DATABASE_URL="<dev-db-url>" pnpm scrape "City Name" --start-date 10/01/2025 --end-date 10/31/2025
```

This will populate your **development database** with scraped data.

### 2. Verify the Data (Check Diff)

```bash
cd apps/web

# Preview what would be synced (dry run)
DATABASE_URL="<dev-db-url>" PROD_DATABASE_URL="<prod-db-url>" \
  pnpm sync-dev-to-prod --dry-run
```

This shows you:
- Database comparison (counts in dev vs prod)
- How many new permits and permit-contractor links would be created
- How many existing records would be updated
- Detailed list of changes

### 3. Sync to Production

Once you've verified the data looks good:

```bash
cd apps/web

# Actually sync (removes --dry-run flag)
DATABASE_URL="<dev-db-url>" PROD_DATABASE_URL="<prod-db-url>" \
  pnpm sync-dev-to-prod
```

This will:
- Create new permits in prod
- Update existing permits that changed
- Create permit-contractor links

## Sync Script Options

### Dry Run (Preview Changes)
```bash
pnpm sync-dev-to-prod --dry-run
```

### Sync Specific Tables
```bash
# Only sync permits (default behavior)
pnpm sync-dev-to-prod --tables=permits

# Sync permits and permit-contractor links (default)
pnpm sync-dev-to-prod --tables=permits,permitContractors

# Include contractors (if needed)
pnpm sync-dev-to-prod --tables=permits,permitContractors,contractors
```

### Default Sync (Permits & Links Only)
```bash
# By default, only syncs permits and permit-contractor links
pnpm sync-dev-to-prod
```

## Environment Variables

### Local Development (`.env`)
```bash
# Development database (for local scraping)
DATABASE_URL="postgresql://dev-db-url"

# Production database (for syncing)
PROD_DATABASE_URL="postgresql://prod-db-url"
```

### Vercel (Production)
```bash
# Production database only
DATABASE_URL="postgresql://prod-db-url"
```

## Quick Reference

```bash
# 1. Scrape locally (populates dev DB)
cd apps/scraper
DATABASE_URL="<dev>" pnpm scrape "Palo Alto" --start-date 10/01/2025 --end-date 10/31/2025

# 2. Preview sync (dry run)
cd apps/web
DATABASE_URL="<dev>" PROD_DATABASE_URL="<prod>" pnpm sync-dev-to-prod --dry-run

# 3. Actually sync to prod
DATABASE_URL="<dev>" PROD_DATABASE_URL="<prod>" pnpm sync-dev-to-prod
```

## Safety Features

- **Dry run mode**: Always preview changes before syncing
- **Upsert logic**: Won't create duplicates (uses `permitNumber` as unique key for permits)
- **Comparison**: Shows counts before syncing
- **Selective sync**: Can sync specific tables only
- **Update detection**: Only updates records that actually changed

## Notes

- **Default behavior**: Only syncs permits and permit-contractor links (contractors are not synced by default)
- The sync script uses `permitNumber` as unique identifier for permits
- Existing records are updated if they've changed
- Permit-contractor links are created if both permit and contractor exist in prod
- Users, subscriptions, and contractors are NOT synced by default
- The script preserves IDs from dev DB when creating new records

