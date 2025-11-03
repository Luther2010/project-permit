#!/usr/bin/env node

/**
 * Permit Scraper CLI
 * Usage: pnpm scrape [city-name]
 * If no city is provided, scrapes all enabled cities
 */

import { scrapeAllCities, scrapeCity } from "./scraper.js";
import { prisma } from "./lib/db";

async function main() {
    const args = process.argv.slice(2);
    let cityName: string | undefined;
    let dateParam: string | undefined;
    let limit: number | undefined;

    // Parse arguments: city name, date, and optional --limit flag
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--limit" || arg === "-l") {
            const limitValue = args[i + 1];
            if (limitValue) {
                limit = parseInt(limitValue, 10);
                if (isNaN(limit) || limit < 1) {
                    console.error(`❌ Invalid limit value: ${limitValue}. Must be a positive number`);
                    process.exit(1);
                }
                i++; // Skip the next argument as it's the limit value
            } else {
                console.error(`❌ --limit flag requires a value`);
                process.exit(1);
            }
        } else if (!cityName) {
            cityName = arg;
        } else if (!dateParam) {
            dateParam = arg;
        }
    }

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
            // Get city config to determine scraper type for better messaging
            const { getCityConfig } = await import("./config/cities.js");
            const config = getCityConfig(cityName);
            let dateMessage = "";
            if (scrapeDate && config) {
                const { ScraperType } = await import("./types.js");
                if (config.scraperType === ScraperType.MONTHLY) {
                    const month = scrapeDate.toLocaleString('default', { month: 'long' });
                    const year = scrapeDate.getFullYear();
                    dateMessage = ` for ${month} ${year}`;
                } else if (config.scraperType === ScraperType.ID_BASED) {
                    // ID_BASED scrapers don't use date - ignore it
                    console.log(`ℹ️  Note: ${cityName} uses ID-based scraping (date parameter will be ignored)`);
                } else {
                    dateMessage = ` on ${scrapeDate.toISOString().split("T")[0]}`;
                }
            } else if (scrapeDate) {
                dateMessage = ` on ${scrapeDate.toISOString().split("T")[0]}`;
            }
            console.log(
                `Scraping permits for: ${cityName}${dateMessage}${limit ? ` (limit: ${limit})` : ""}`
            );
            await scrapeCity(cityName, scrapeDate, limit);
        } else {
            console.log(
                `Scraping permits for all enabled cities${scrapeDate ? ` on ${scrapeDate.toISOString().split("T")[0]}` : ""}${limit ? ` (limit: ${limit})` : ""}`
            );
            await scrapeAllCities(scrapeDate, limit);
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
