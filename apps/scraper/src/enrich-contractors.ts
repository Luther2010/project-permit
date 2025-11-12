/**
 * Enrich permits with contractor information by searching by contractor license number
 * 
 * This script:
 * 1. Gets all contractors associated with permits in the specified date range
 * 2. For each contractor, searches Accela portals (Cupertino/Palo Alto) by license number
 * 3. Matches found permits to existing permits in the database
 * 4. Links contractors to permits via PermitContractor table
 * 
 * Usage:
 *   pnpm tsx src/enrich-contractors.ts "Cupertino" --start-date 2025-01-01 --end-date 2025-01-31 --limit 10
 *   pnpm tsx src/enrich-contractors.ts "Palo Alto" --start-date 2025-01-01 --end-date 2025-01-31
 */

import { getActiveContractorsByCityAndDateRange } from "./lib/get-active-contractors";
import { createExtractor } from "./extractor-factory";
import { getCityConfig } from "./config/cities";
import { prisma } from "./lib/db";
import { AccelaBaseExtractor } from "./extractors/accela-base-extractor";
import { matchContractorFromText } from "./lib/contractor-matching";
import { City } from "@prisma/client";

/**
 * Cities that support contractor enrichment via license-based search
 * These cities use Accela portals where contractor info is only visible
 * when searching by contractor license number
 */
export const CITIES_WITH_CONTRACTOR_ENRICHMENT = ["Palo Alto", "Cupertino"];

/**
 * Check if a city supports contractor enrichment
 */
export function supportsContractorEnrichment(cityName: string): boolean {
    return CITIES_WITH_CONTRACTOR_ENRICHMENT.includes(cityName);
}

/**
 * Map city name to City enum
 */
function mapCity(cityName: string): City | undefined {
    const normalized = cityName.trim().toUpperCase();
    const cityMap: Record<string, City> = {
        "CUPERTINO": City.CUPERTINO,
        "PALO ALTO": City.PALO_ALTO,
    };
    return cityMap[normalized];
}

/**
 * Enrich permits for a specific city with contractor information
 * 
 * @param cityName - City to enrich permits for
 * @param permitStartDate - Start date for permits to enrich
 * @param permitEndDate - End date for permits to enrich
 * @param contractorStartDate - Start date for contractor query (defaults to 12 months ago)
 * @param contractorEndDate - End date for contractor query (defaults to today)
 * @param limit - Optional limit on number of contractors to process
 */
export async function enrichPermitsForCity(
    cityName: string,
    permitStartDate: Date,
    permitEndDate: Date,
    contractorStartDate?: Date,
    contractorEndDate?: Date,
    limit?: number
): Promise<void> {
    console.log(`[enrich-contractors] Starting enrichment for ${cityName}`);
    console.log(`[enrich-contractors] Permit enrichment date range: ${permitStartDate.toISOString()} to ${permitEndDate.toISOString()}`);

    const cityEnum = mapCity(cityName);
    if (!cityEnum) {
        throw new Error(`Unsupported city: ${cityName}. Supported cities: Cupertino, Palo Alto`);
    }

    // Determine contractor query date range (defaults to 12 months)
    let contractorQueryStart: Date;
    let contractorQueryEnd: Date;
    
    if (contractorStartDate && contractorEndDate) {
        contractorQueryStart = contractorStartDate;
        contractorQueryEnd = contractorEndDate;
    } else {
        // Default to last 12 months
        contractorQueryEnd = new Date();
        contractorQueryStart = new Date();
        contractorQueryStart.setMonth(contractorQueryStart.getMonth() - 12);
    }
    
    console.log(`[enrich-contractors] Contractor query date range: ${contractorQueryStart.toISOString()} to ${contractorQueryEnd.toISOString()}`);

    // Get active contractors from permits in the contractor query date range (across all cities)
    console.log(`[enrich-contractors] Fetching contractors associated with permits in contractor query date range (all cities)...`);
    const activeContractors = await getActiveContractorsByCityAndDateRange(
        contractorQueryStart,
        contractorQueryEnd
    );
    console.log(`[enrich-contractors] Found ${activeContractors.length} active contractors`);

    // Get city config and create extractor
    const cityConfig = getCityConfig(cityName);
    if (!cityConfig) {
        throw new Error(`City not found in configuration: ${cityName}`);
    }

    if (!cityConfig.enabled) {
        throw new Error(`City ${cityName} is disabled in configuration`);
    }

    const extractor = createExtractor(cityConfig);

    if (!(extractor instanceof AccelaBaseExtractor)) {
        throw new Error(`${cityName} extractor is not an AccelaBaseExtractor`);
    }

    const accelaExtractor = extractor as AccelaBaseExtractor;

    // Track statistics
    let processed = 0;
    let permitsFound = 0;
    let permitsMatched = 0;
    let permitsUpdated = 0;
    let contractorsLinked = 0;
    let errors = 0;

    // Process contractors (with optional limit for testing)
    const contractorsToProcess = limit
        ? activeContractors.slice(0, limit)
        : activeContractors;

    console.log(
        `[enrich-contractors] Processing ${contractorsToProcess.length} contractors...`
    );

    for (const contractor of contractorsToProcess) {
        try {
            processed++;
            console.log(
                `[enrich-contractors] [${processed}/${contractorsToProcess.length}] Processing contractor: ${contractor.licenseNo} (${contractor.name || "Unknown"})`
            );

            // Search for permits by contractor license with date range filter
            const result = await accelaExtractor.scrapeByContractorLicense(
                contractor.licenseNo,
                permitStartDate,
                permitEndDate
            );

            if (!result.success) {
                console.error(
                    `[enrich-contractors] Failed to search for contractor ${contractor.licenseNo}: ${result.error}`
                );
                errors++;
                continue;
            }

            permitsFound += result.permits.length;
            console.log(
                `[enrich-contractors] Found ${result.permits.length} permits for contractor ${contractor.licenseNo}`
            );

            // For each permit found, try to match it to an existing permit
            for (const scrapedPermit of result.permits) {
                try {
                    // Find existing permit by permit number and city
                    const existingPermit = await prisma.permit.findUnique({
                        where: {
                            permitNumber: scrapedPermit.permitNumber,
                        },
                        include: {
                            contractors: true,
                        },
                    });

                    if (!existingPermit) {
                        console.log(
                            `[enrich-contractors] Permit ${scrapedPermit.permitNumber} not found in database, skipping...`
                        );
                        continue;
                    }

                    permitsMatched++;

                    // Directly link the contractor using the license number we searched for
                    // Since we searched by this contractor's license, all permits found belong to this contractor
                    const contractorRecord = await prisma.contractor.findUnique({
                        where: { licenseNo: contractor.licenseNo },
                    });

                    if (!contractorRecord) {
                        console.log(
                            `[enrich-contractors] Could not find contractor record for license ${contractor.licenseNo}`
                        );
                        continue;
                    }

                    // Check if link already exists
                    const existingLink = await prisma.permitContractor.findUnique({
                        where: {
                            permitId_contractorId: {
                                permitId: existingPermit.id,
                                contractorId: contractorRecord.id,
                            },
                        },
                    });

                    if (!existingLink) {
                        // Create link
                        await prisma.permitContractor.create({
                            data: {
                                permitId: existingPermit.id,
                                contractorId: contractorRecord.id,
                                role: "CONTRACTOR",
                            },
                        });
                        contractorsLinked++;
                        permitsUpdated++;
                        console.log(
                            `[enrich-contractors] Linked contractor ${contractorRecord.licenseNo} (${contractorRecord.name || "Unknown"}) to permit ${scrapedPermit.permitNumber}`
                        );
                    } else {
                        console.log(
                            `[enrich-contractors] Contractor ${contractorRecord.licenseNo} already linked to permit ${scrapedPermit.permitNumber}`
                        );
                    }
                } catch (error) {
                    console.error(
                        `[enrich-contractors] Error processing permit ${scrapedPermit.permitNumber}:`,
                        error
                    );
                    errors++;
                }
            }

            // Add delay between contractors to avoid overwhelming the server
            await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(
                `[enrich-contractors] Error processing contractor ${contractor.licenseNo}:`,
                error
            );
            errors++;
        }
    }

    console.log(`[enrich-contractors] Enrichment complete for ${cityName}`);
    console.log(`[enrich-contractors] Statistics:`);
    console.log(`  - Contractors processed: ${processed}`);
    console.log(`  - Permits found: ${permitsFound}`);
    console.log(`  - Permits matched: ${permitsMatched}`);
    console.log(`  - Permits updated: ${permitsUpdated}`);
    console.log(`  - Contractors linked: ${contractorsLinked}`);
    console.log(`  - Errors: ${errors}`);
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const cityName = args[0];

    if (!cityName) {
        console.error("Usage: pnpm tsx src/enrich-contractors.ts <city> --start-date <YYYY-MM-DD> --end-date <YYYY-MM-DD> [--contractor-start-date <YYYY-MM-DD>] [--contractor-end-date <YYYY-MM-DD>] [--limit <number>]");
        console.error("Supported cities: Cupertino, Palo Alto");
        console.error("Example: pnpm tsx src/enrich-contractors.ts \"Cupertino\" --start-date 2025-01-01 --end-date 2025-01-31 --limit 10");
        console.error("Note: Contractor date range defaults to last 12 months if not specified");
        process.exit(1);
    }

    // Parse permit enrichment start date
    const startDateIndex = args.indexOf("--start-date");
    if (startDateIndex === -1 || !args[startDateIndex + 1]) {
        console.error("Error: --start-date is required");
        console.error("Usage: pnpm tsx src/enrich-contractors.ts <city> --start-date <YYYY-MM-DD> --end-date <YYYY-MM-DD> [--contractor-start-date <YYYY-MM-DD>] [--contractor-end-date <YYYY-MM-DD>] [--limit <number>]");
        process.exit(1);
    }
    const startDateStr = args[startDateIndex + 1];
    // Parse date string manually to avoid timezone issues
    // Using local time constructor to match formatDateForAccela which uses getMonth(), getDate(), getFullYear()
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    if (!startYear || !startMonth || !startDay) {
        console.error(`Invalid start date: ${startDateStr}. Expected format: YYYY-MM-DD`);
        process.exit(1);
    }
    const permitStartDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    if (isNaN(permitStartDate.getTime())) {
        console.error(`Invalid start date: ${startDateStr}. Expected format: YYYY-MM-DD`);
        process.exit(1);
    }

    // Parse permit enrichment end date
    const endDateIndex = args.indexOf("--end-date");
    if (endDateIndex === -1 || !args[endDateIndex + 1]) {
        console.error("Error: --end-date is required");
        console.error("Usage: pnpm tsx src/enrich-contractors.ts <city> --start-date <YYYY-MM-DD> --end-date <YYYY-MM-DD> [--contractor-start-date <YYYY-MM-DD>] [--contractor-end-date <YYYY-MM-DD>] [--limit <number>]");
        process.exit(1);
    }
    const endDateStr = args[endDateIndex + 1];
    // Parse date string manually to avoid timezone issues
    // Using local time constructor to match formatDateForAccela which uses getMonth(), getDate(), getFullYear()
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    if (!endYear || !endMonth || !endDay) {
        console.error(`Invalid end date: ${endDateStr}. Expected format: YYYY-MM-DD`);
        process.exit(1);
    }
    const permitEndDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    if (isNaN(permitEndDate.getTime())) {
        console.error(`Invalid end date: ${endDateStr}. Expected format: YYYY-MM-DD`);
        process.exit(1);
    }

    if (permitStartDate > permitEndDate) {
        console.error("Error: permit start date must be before or equal to permit end date");
        process.exit(1);
    }

    // Parse contractor query date range (optional, defaults to 12 months)
    let contractorStartDate: Date | undefined;
    let contractorEndDate: Date | undefined;
    
    const contractorStartIndex = args.indexOf("--contractor-start-date");
    if (contractorStartIndex !== -1 && args[contractorStartIndex + 1]) {
        const contractorStartStr = args[contractorStartIndex + 1];
        // Parse date string manually to avoid timezone issues
        // Using local time constructor to match formatDateForAccela which uses getMonth(), getDate(), getFullYear()
        const [year, month, day] = contractorStartStr.split('-').map(Number);
        if (!year || !month || !day) {
            console.error(`Invalid contractor start date: ${contractorStartStr}. Expected format: YYYY-MM-DD`);
            process.exit(1);
        }
        contractorStartDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (isNaN(contractorStartDate.getTime())) {
            console.error(`Invalid contractor start date: ${contractorStartStr}. Expected format: YYYY-MM-DD`);
            process.exit(1);
        }
    }

    const contractorEndIndex = args.indexOf("--contractor-end-date");
    if (contractorEndIndex !== -1 && args[contractorEndIndex + 1]) {
        const contractorEndStr = args[contractorEndIndex + 1];
        // Parse date string manually to avoid timezone issues
        // Using local time constructor to match formatDateForAccela which uses getMonth(), getDate(), getFullYear()
        const [year, month, day] = contractorEndStr.split('-').map(Number);
        if (!year || !month || !day) {
            console.error(`Invalid contractor end date: ${contractorEndStr}. Expected format: YYYY-MM-DD`);
            process.exit(1);
        }
        contractorEndDate = new Date(year, month - 1, day, 23, 59, 59, 999);
        if (isNaN(contractorEndDate.getTime())) {
            console.error(`Invalid contractor end date: ${contractorEndStr}. Expected format: YYYY-MM-DD`);
            process.exit(1);
        }
    }

    // If one contractor date is provided, both should be provided
    if ((contractorStartDate && !contractorEndDate) || (!contractorStartDate && contractorEndDate)) {
        console.error("Error: both --contractor-start-date and --contractor-end-date must be provided together, or neither");
        process.exit(1);
    }

    if (contractorStartDate && contractorEndDate && contractorStartDate > contractorEndDate) {
        console.error("Error: contractor start date must be before or equal to contractor end date");
        process.exit(1);
    }

    // Parse limit if provided
    let limit: number | undefined;
    const limitIndex = args.indexOf("--limit");
    if (limitIndex !== -1 && args[limitIndex + 1]) {
        limit = parseInt(args[limitIndex + 1], 10);
        if (isNaN(limit) || limit <= 0) {
            console.error("Invalid limit value. Must be a positive number.");
            process.exit(1);
        }
    }

    try {
        await enrichPermitsForCity(
            cityName,
            permitStartDate,
            permitEndDate,
            contractorStartDate,
            contractorEndDate,
            limit
        );
    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

