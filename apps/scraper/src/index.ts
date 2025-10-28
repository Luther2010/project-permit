#!/usr/bin/env node

/**
 * Permit Scraper CLI
 * Usage: pnpm scrape [city-name]
 * If no city is provided, scrapes all enabled cities
 */

import { scrapeAllCities, scrapeCity } from "./scraper.js";
import { prisma } from "./lib/db";

async function main() {
  const cityName = process.argv[2];

  try {
    if (cityName) {
      console.log(`Scraping permits for: ${cityName}`);
      await scrapeCity(cityName);
    } else {
      console.log("Scraping permits for all enabled cities");
      await scrapeAllCities();
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Scraping failed:", error);
    process.exit(1);
  } finally {
    // Ensure Prisma client disconnects
    await prisma.$disconnect();
  }
}

main();
