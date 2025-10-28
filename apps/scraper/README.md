# Permit Scraper

A standalone scraper service for collecting permit data from various government websites.

## Overview

This is a separate application in the monorepo that handles periodic scraping of permit data from different cities. It's designed to run as a scheduled job (daily/hourly/etc).

## Features

- ✅ City-to-extractor mapping system
- ✅ Extensible extractor architecture
- ✅ Automatic database updates
- ✅ Error handling and logging

## Usage

```bash
# Scrape all enabled cities
pnpm scrape

# Scrape specific city
pnpm scrape "San Francisco"
```

## Architecture

See `src/README.md` for detailed architecture documentation.

## Adding New Cities

1. Create an extractor in `src/extractors/[city].ts`
2. Add the city to `src/config/cities.ts`
3. Update the factory in `src/extractor-factory.ts`

## Database

Shares the same Prisma schema and database as the `web` app through the monorepo's shared dependencies.

## Deployment

This can be deployed as:
- A cron job on your server
- A scheduled Lambda function
- A Kubernetes CronJob
- Or run manually when needed


