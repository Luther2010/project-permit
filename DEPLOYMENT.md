# Deployment Guide for Vercel

## Overview

This project is a monorepo with:
- **apps/web**: Next.js web application (deploy to Vercel)
- **apps/scraper**: Node.js scraper (run separately, not on Vercel)

## Critical Changes Needed

### 1. Database Migration: SQLite → PostgreSQL

**Current Issue**: Vercel doesn't support SQLite (file-based database). You need PostgreSQL.

**Options**:
- **Vercel Postgres** (recommended): Integrated with Vercel, easy setup
- **Neon**: Serverless PostgreSQL, good free tier
- **Supabase**: PostgreSQL with additional features
- **Railway/Render**: Traditional PostgreSQL hosting

**Migration Steps**:

1. **Update Prisma schema** (`apps/web/prisma/schema.prisma`):
   ```prisma
   datasource db {
     provider = "postgresql"  // Change from "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

2. **Create new migration**:
   ```bash
   cd apps/web
   pnpm prisma migrate dev --name migrate_to_postgresql
   ```

3. **Update connection string**:
   - For Vercel Postgres: Get connection string from Vercel dashboard
   - Format: `postgresql://user:password@host:port/database?sslmode=require`

### 2. Vercel Configuration

Create `vercel.json` in the root:

```json
{
  "buildCommand": "cd apps/web && pnpm install && pnpm prisma generate && pnpm build",
  "outputDirectory": "apps/web/.next",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "rootDirectory": "apps/web",
  "env": {
    "DATABASE_URL": "@database_url",
    "NEXTAUTH_SECRET": "@nextauth_secret",
    "NEXTAUTH_URL": "@nextauth_url"
  }
}
```

Or configure via Vercel Dashboard:
- **Framework Preset**: Next.js
- **Root Directory**: `apps/web`
- **Build Command**: `cd ../.. && pnpm install && cd apps/web && pnpm prisma generate && pnpm build`
- **Output Directory**: `.next` (default)

### 3. Environment Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

**Required**:
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Random secret (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL`: Your production URL (e.g., `https://your-app.vercel.app`)

**Optional** (if using OAuth providers):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`

### 4. Build Settings

In Vercel Dashboard:
- **Install Command**: `pnpm install`
- **Build Command**: `cd apps/web && pnpm prisma generate && pnpm build`
- **Output Directory**: `apps/web/.next`

### 5. Prisma Setup for Production

Add to `apps/web/package.json` scripts:
```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "vercel-build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

### 6. Scraper Deployment (Separate)

The scraper should **NOT** run on Vercel. Options:

**Option A: Local Script + Sync to Production** (Future)
- Run scraper locally on your machine
- Sync changes to production after review
- Full control over when and what gets synced
- See "Local Scraper + Production Sync" section below (to be implemented)

**Option B: VPS/Server** (For automated scraping)
- Deploy to a VPS (DigitalOcean, Linode, etc.)
- Set up cron jobs for scheduled scraping
- Can run Puppeteer with headless Chrome
- Can use same sync script to push to production

**Option C: GitHub Actions** (For scheduled runs)
- Create `.github/workflows/scrape.yml`
- Run on schedule (cron)
- Limited execution time (free tier: 6 hours/month)
- Can trigger sync after scraping

**Option D: Railway/Render**
- Deploy scraper as a separate service
- Use their cron job feature
- Better for long-running processes

**Option E: Vercel Cron Jobs** (Vercel Pro required)
- Use Vercel Cron for scheduled API routes
- Create API route that triggers scraping
- Note: Limited execution time (10s on Hobby, 60s on Pro)

### 7. Database Connection

Update `apps/web/src/lib/db.ts` for production:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

## Step-by-Step Deployment

### Phase 1: Database Setup

1. **Choose PostgreSQL provider** (recommend Vercel Postgres)
2. **Create database** and get connection string
3. **Update Prisma schema** to use PostgreSQL
4. **Run migration locally** to test
5. **Export data from SQLite** (if needed):
   ```bash
   # Export SQLite data
   sqlite3 apps/web/prisma/dev.db .dump > backup.sql
   ```

### Phase 2: Vercel Setup

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Link project**:
   ```bash
   cd apps/web
   vercel link
   ```

4. **Set environment variables**:
   ```bash
   vercel env add DATABASE_URL
   vercel env add NEXTAUTH_SECRET
   vercel env add NEXTAUTH_URL
   ```

5. **Deploy**:
   ```bash
   vercel --prod
   ```

### Phase 3: Scraper Setup

1. **Choose scraper hosting** (VPS recommended)
2. **Set up environment** with same `DATABASE_URL`
3. **Configure cron** for scheduled scraping
4. **Test scraper** connects to production database

## Testing Checklist

- [ ] Database migration successful
- [ ] Prisma client generates correctly
- [ ] Environment variables set
- [ ] Build completes successfully
- [ ] Web app loads on Vercel
- [ ] Database queries work
- [ ] Authentication works
- [ ] Scraper can connect to production DB (if applicable)

## Troubleshooting

### Build Fails: Prisma Client Not Generated
- Add `prisma generate` to build command
- Ensure `@prisma/client` is in dependencies

### Database Connection Errors
- Check `DATABASE_URL` format
- Ensure SSL is enabled (`?sslmode=require`)
- Verify database is accessible from Vercel IPs

### Monorepo Build Issues
- Set correct root directory in Vercel
- Ensure `pnpm-workspace.yaml` is configured
- Check turbo.json for build dependencies

## Local Scraper + Production Sync Workflow (Future)

This approach will let you run the scraper locally and sync changes to production after review. To be implemented after Vercel setup is complete.

## Next Steps

1. Set up Vercel Postgres or external PostgreSQL
2. Migrate Prisma schema (✅ Done - changed to postgresql)
3. Test migration locally with PostgreSQL
4. Deploy to Vercel
5. Set up local scraper + sync workflow (Future - after Vercel setup)
6. Configure scheduled scraping (optional, later)

