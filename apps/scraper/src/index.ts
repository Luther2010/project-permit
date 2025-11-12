#!/usr/bin/env node

/**
 * Permit Scraper CLI
 * Usage: pnpm scrape [city-name]
 * If no city is provided, scrapes all enabled cities
 */

import { scrapeAllCities, scrapeCity } from "./scraper.js";
import { prisma } from "./lib/db";

/**
 * Parse date string (YYYY-MM-DD format) to Date object
 */
function parseDate(dateStr: string): Date {
    const dateParts = dateStr.split("-");
    if (dateParts.length === 3) {
        const date = new Date(
            parseInt(dateParts[0]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[2])
        );
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
        }
        return date;
    } else {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
        }
        return date;
    }
}

async function main() {
    const args = process.argv.slice(2);
    let cityName: string | undefined;
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let limit: number | undefined;
    let contractorLimit: number | undefined;

    // Parse arguments: city name, date flags, and optional --limit flag
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
        } else if (arg === "--contractor-limit" || arg === "--cl") {
            const limitValue = args[i + 1];
            if (limitValue) {
                contractorLimit = parseInt(limitValue, 10);
                if (isNaN(contractorLimit) || contractorLimit < 1) {
                    console.error(`❌ Invalid contractor limit value: ${limitValue}. Must be a positive number`);
                    process.exit(1);
                }
                i++; // Skip the next argument as it's the limit value
            } else {
                console.error(`❌ --contractor-limit flag requires a value`);
                process.exit(1);
            }
        } else if (arg === "--start-date" || arg === "--start") {
            const dateValue = args[i + 1];
            if (dateValue) {
                try {
                    startDate = parseDate(dateValue);
                    i++; // Skip the next argument as it's the date value
                } catch (e: any) {
                    console.error(`❌ Invalid start date: ${e.message}`);
                    process.exit(1);
                }
            } else {
                console.error(`❌ --start-date flag requires a value (YYYY-MM-DD)`);
                process.exit(1);
            }
        } else if (arg === "--end-date" || arg === "--end") {
            const dateValue = args[i + 1];
            if (dateValue) {
                try {
                    endDate = parseDate(dateValue);
                    i++; // Skip the next argument as it's the date value
                } catch (e: any) {
                    console.error(`❌ Invalid end date: ${e.message}`);
                    process.exit(1);
                }
            } else {
                console.error(`❌ --end-date flag requires a value (YYYY-MM-DD)`);
                process.exit(1);
            }
        } else if (!cityName && !arg.startsWith("--") && !arg.startsWith("-")) {
            cityName = arg;
        }
    }

    try {
        if (cityName) {
            console.log(
                `Scraping permits for: ${cityName}${startDate && endDate ? ` (range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]})` : startDate ? ` (from: ${startDate.toISOString().split("T")[0]})` : ""}${limit ? ` (limit: ${limit})` : ""}${contractorLimit ? ` (contractor limit: ${contractorLimit})` : ""}`
            );
            await scrapeCity(cityName, limit, startDate, endDate, contractorLimit);
        } else {
            const rangeMessage = startDate && endDate 
                ? ` (range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]})`
                : startDate 
                    ? ` (from: ${startDate.toISOString().split("T")[0]})`
                    : "";
            console.log(
                `Scraping permits for all enabled cities${rangeMessage}${limit ? ` (limit: ${limit})` : ""}${contractorLimit ? ` (contractor limit: ${contractorLimit})` : ""}`
            );
            await scrapeAllCities(limit, startDate, endDate, contractorLimit);
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
