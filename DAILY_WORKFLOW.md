# Daily Workflow Guide

This document outlines the daily tasks required to maintain and update the permit scraping system.

## Overview

The daily workflow consists of:
1. Running scrapes for all cities from the previous day
2. Manually filling in missing data for Energov-based cities
3. Running contractor enrichment (daily: top 100, weekly: full)
4. Dry-running the sync script to review changes
5. Syncing data to production
6. Sending daily permit emails

---

## Step 1: Run Daily Scrapes

Run scrapes for all 14 cities for the **previous day's date**.

### Command Format
```bash
cd apps/scraper
pnpm scrape "<City Name>" --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

### Example (for November 26, 2025)
```bash
# Run all cities in parallel (background processes)
cd apps/scraper

pnpm scrape "Los Gatos" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-los-gatos.log 2>&1 &
pnpm scrape Saratoga --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-saratoga.log 2>&1 &
pnpm scrape "Santa Clara" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-santa-clara.log 2>&1 &
pnpm scrape Cupertino --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-cupertino.log 2>&1 &
pnpm scrape "Palo Alto" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-palo-alto.log 2>&1 &
pnpm scrape "Los Altos Hills" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-los-altos-hills.log 2>&1 &
pnpm scrape Sunnyvale --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-sunnyvale.log 2>&1 &
pnpm scrape "San Jose" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-san-jose.log 2>&1 &
pnpm scrape Campbell --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-campbell.log 2>&1 &
pnpm scrape "Mountain View" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-mountain-view.log 2>&1 &
pnpm scrape Gilroy --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-gilroy.log 2>&1 &
pnpm scrape Milpitas --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-milpitas.log 2>&1 &
pnpm scrape "Morgan Hill" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-morgan-hill.log 2>&1 &
pnpm scrape "Los Altos" --start-date 2025-11-26 --end-date 2025-11-26 > /tmp/scrape-los-altos.log 2>&1 &
```

### Monitor Progress
Check log files to monitor progress:
```bash
tail -f /tmp/scrape-*.log
```

### Notes
- All cities run in parallel as background processes
- Logs are saved to `/tmp/scrape-<city-name>.log`
- Scrapes may take 10-30 minutes depending on the number of permits
- Some permits may have 403 errors (rate limiting) - these will still be saved but without `value` and `contractorLicense` fields

---

## Step 2: Manually Fill in Energov Data

Energov-based cities (Sunnyvale and Gilroy) have detail page extraction disabled to avoid rate limiting. Permits are saved but without:
- **Valuation** (`value` field)
- **Contractor License** (`licensedProfessionalText` field)

### Workflow

#### 1. Generate CSV Template
Generate a CSV template for the previous day's Energov permits:

```bash
cd apps/web
pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts YYYY-MM-DD ../../data/energov-manual-data-YYYY-MM-DD.csv
```

**Example:**
```bash
pnpm exec dotenv -e .env -- tsx scripts/generate-energov-template.ts 2025-11-26 ../../data/energov-manual-data-2025-11-26.csv
```

This will:
- Query all Sunnyvale and Gilroy permits for the specified date
- Generate a CSV with columns: `permitNumber`, `value`, `contractorLicense`
- Pre-fill existing values if any permits already have data

#### 2. Fill in the CSV
Open the generated CSV file and fill in:
- **value**: Project valuation (numeric, e.g., `34100`)
- **contractorLicense**: Contractor license number (e.g., `123456`)

**CSV Format:**
```csv
permitNumber,value,contractorLicense
BLDG-2025-5155,34100,123456
BLDG-2025-5156,19482,
BLDG-2025-5157,,
```

**Notes:**
- Leave fields empty if you don't have the data (won't overwrite existing values)
- Value should be numeric (no dollar signs or commas)
- Contractor license should be the license number only

#### 3. Import the CSV
Import the filled CSV to update the database:

```bash
cd apps/web
pnpm exec dotenv -e .env -- tsx scripts/import-energov-manual-data.ts ../../data/energov-manual-data-YYYY-MM-DD.csv
```

**Example:**
```bash
pnpm exec dotenv -e .env -- tsx scripts/import-energov-manual-data.ts ../../data/energov-manual-data-2025-11-26.csv
```

This will:
- Update permit `value` fields
- Update permit `licensedProfessionalText` fields
- Automatically link contractors if license numbers are found in the database
- Show a summary of updates, not found permits, and errors

### Notes
- Permits are always saved even without detail page data
- Empty CSV cells are skipped (won't overwrite existing data)
- Contractor license numbers will trigger automatic contractor matching and linking
- The import script will show which permits were updated and which contractors were linked

---

## Step 3: Contractor Enrichment

Contractor enrichment is expensive, so we use a tiered approach:

### Daily: Top 100 Contractors
Enrich permits for the top 100 most active contractors (by permit count).

```bash
cd apps/scraper
pnpm tsx src/enrich-contractors.ts --start-date YYYY-MM-DD --end-date YYYY-MM-DD --limit 100
```

**Example:**
```bash
pnpm tsx src/enrich-contractors.ts --start-date 2025-11-26 --end-date 2025-11-26 --limit 100
```

This will:
- Get all active contractors from the last 12 months
- Sort them by permit count (descending)
- Process only the top 100
- Enrich permits for Cupertino and Palo Alto (supported cities)

### Weekly: Full Contractor Enrichment
Once per week (e.g., Sunday), run full enrichment without a limit:

```bash
cd apps/scraper
pnpm tsx src/enrich-contractors.ts --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

**Example:**
```bash
# For the past week
pnpm tsx src/enrich-contractors.ts --start-date 2025-11-20 --end-date 2025-11-26
```

### Notes
- Supported cities: **Cupertino** and **Palo Alto** only
- Contractor enrichment searches Accela portals by contractor license number
- Links contractors to permits via the `PermitContractor` table
- The script automatically sorts contractors by permit count (highest first)

---

## Step 4: Dry-Run Sync Script

Before syncing to production, always run a dry-run to review what will be changed.

### Command
```bash
cd apps/web
pnpm exec dotenv -e .env -- tsx scripts/sync-dev-to-prod.ts --dry-run
```

### What It Shows
- Number of permits to be synced
- Number of permit-contractor links to be synced
- Detailed diff of what will change
- Summary of additions, updates, and deletions

### Review the Output
- Verify the number of permits matches expectations
- Check for any unexpected changes
- Ensure no sensitive data is being synced

---

## Step 5: Sync to Production

After reviewing the dry-run, sync the data to production.

### Command
```bash
cd apps/web
pnpm exec dotenv -e .env -- tsx scripts/sync-dev-to-prod.ts
```

### What Gets Synced
- **Permits**: All permits from the development database
- **Permit-Contractor Links**: All links between permits and contractors

### Environment Variables Required
- `DATABASE_URL`: Development database connection string
- `PROD_DATABASE_URL`: Production database connection string

### Notes
- The sync script uses upsert operations (insert or update)
- Only `permits` and `permitContractors` tables are synced by default
- The script will show progress and summary statistics

---

## Step 6: Send Daily Permit Emails

Send daily permit emails to subscribers for the previous day's permits.

### Command
```bash
cd apps/web
pnpm exec dotenv -e .env -- tsx scripts/send-daily-permits.ts <email> YYYY-MM-DD
```

### Example
```bash
# Send email for November 26, 2025
pnpm exec dotenv -e .env -- tsx scripts/send-daily-permits.ts user@example.com 2025-11-26
```

### What It Does
- Queries all permits with `appliedDateString` matching the specified date
- Groups permits by city
- Generates HTML and text email content
- Sends email via AWS SES

### Notes
- Test with your own email first before sending to all subscribers
- The script shows permit counts by city before sending
- Email includes a summary and breakdown by city

---

## Quick Reference: Daily Checklist

- [ ] Run scrapes for all 14 cities (previous day's date)
- [ ] Check scrape logs for errors
- [ ] Generate Energov CSV template for previous day
- [ ] Fill in value and contractor license in CSV
- [ ] Import Energov CSV to update database
- [ ] Run top 100 contractor enrichment (daily)
- [ ] Run full contractor enrichment (weekly only)
- [ ] Dry-run sync script to review changes
- [ ] Sync to production
- [ ] Send daily permit emails

---

## Weekly Tasks

### Full Contractor Enrichment
Run once per week (recommended: Sunday) for the past week's permits:

```bash
cd apps/scraper
# Get last Sunday's date and today's date
pnpm tsx src/enrich-contractors.ts --start-date 2025-11-20 --end-date 2025-11-26
```

---

## Troubleshooting

### Scrape Failures
- Check individual city log files in `/tmp/scrape-*.log`
- Some cities may fail due to website changes or rate limiting
- Re-run failed cities individually

### 403 Errors (Energov Cities)
- Normal behavior when rate limiting occurs
- Permits are still saved without detail page data
- Manually fill in missing data if needed
- Consider increasing wait times between detail page requests

### Sync Issues
- Always run dry-run first
- Verify environment variables are set correctly
- Check database connection strings
- Review the diff output carefully

### Email Sending Issues
- Verify AWS SES credentials are configured
- Check email format (must be valid email address)
- Verify date format (YYYY-MM-DD)
- Test with your own email first

---

## Date Format Reference

All dates should be in **YYYY-MM-DD** format:
- ✅ `2025-11-26`
- ❌ `11/26/2025`
- ❌ `2025-11-26T00:00:00Z`

---

## Environment Setup

Ensure you have the following environment variables set:

### Development Database
```bash
DATABASE_URL=postgresql://...
```

### Production Database
```bash
PROD_DATABASE_URL=postgresql://...
```

### AWS SES (for emails)
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

## Notes

- All scrapes should be run for the **previous day's date**
- Energov cities (Sunnyvale, Gilroy) may need manual data entry due to rate limiting
- Contractor enrichment is expensive - use top 100 daily, full weekly
- Always dry-run sync before syncing to production
- Test emails before sending to all subscribers

