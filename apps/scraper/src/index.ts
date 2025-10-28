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
    const dateParam = process.argv[3];

    // Parse date if provided (expecting YYYY-MM-DD format)
    let scrapeDate: Date | undefined;
    if (dateParam) {
        // Parse YYYY-MM-DD and create date in local timezone to avoid timezone issues
        const dateParts = dateParam.split("-");
        if (dateParts.length === 3) {
            scrapeDate = new Date(
                parseInt(dateParts[0]),
                parseInt(dateParts[1]) - 1,
                parseInt(dateParts[2])
            );
        } else {
            scrapeDate = new Date(dateParam);
        }
        if (isNaN(scrapeDate.getTime())) {
            console.error(
                `❌ Invalid date format: ${dateParam}. Expected YYYY-MM-DD`
            );
            process.exit(1);
        }
    }

    try {
        if (cityName) {
            console.log(
                `Scraping permits for: ${cityName}${scrapeDate ? ` on ${scrapeDate.toISOString().split("T")[0]}` : ""}`
            );
            await scrapeCity(cityName, scrapeDate);
        } else {
            console.log(
                `Scraping permits for all enabled cities${scrapeDate ? ` on ${scrapeDate.toISOString().split("T")[0]}` : ""}`
            );
            await scrapeAllCities(scrapeDate);
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
