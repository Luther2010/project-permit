/**
 * Check number of permits per city for a date range
 * Usage: pnpm tsx scripts/check-permits-by-city.ts --start-date 2025-01-01 --end-date 2025-01-15
 */

import { prisma } from "../src/lib/db";
import { City } from "@prisma/client";

async function main() {
    const args = process.argv.slice(2);
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--start-date" || arg === "--start") {
            const dateValue = args[i + 1];
            if (dateValue) {
                startDate = new Date(dateValue);
                i++;
            }
        } else if (arg === "--end-date" || arg === "--end") {
            const dateValue = args[i + 1];
            if (dateValue) {
                endDate = new Date(dateValue);
                i++;
            }
        }
    }

    if (!startDate || !endDate) {
        console.error("Usage: pnpm tsx scripts/check-permits-by-city.ts --start-date YYYY-MM-DD --end-date YYYY-MM-DD");
        process.exit(1);
    }

    // Set end date to end of day
    const endDateEndOfDay = new Date(endDate);
    endDateEndOfDay.setHours(23, 59, 59, 999);

    console.log(`Checking permits from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}\n`);

    // Get all cities
    const cities = Object.values(City);

    // Query permits for each city
    const results: Array<{ city: City; count: number }> = [];

    for (const city of cities) {
        const count = await prisma.permit.count({
            where: {
                city: city,
                appliedDate: {
                    gte: startDate,
                    lte: endDateEndOfDay,
                },
            },
        });
        results.push({ city, count });
    }

    // Sort by count descending
    results.sort((a, b) => b.count - a.count);

    // Display results
    console.log("Permits per city:");
    console.log("=".repeat(50));
    let total = 0;
    for (const { city, count } of results) {
        if (count > 0) {
            console.log(`${city.padEnd(20)} ${count.toString().padStart(6)}`);
            total += count;
        }
    }
    console.log("=".repeat(50));
    console.log(`Total: ${total.toString().padStart(26)}`);

    await prisma.$disconnect();
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});

