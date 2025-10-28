/**
 * Main scraper orchestrator
 * Orchestrates scraping across all enabled cities
 */

import { getEnabledCities, getCityConfig } from "./config/cities";
import { createExtractor } from "./extractor-factory";
import { prisma } from "./lib/db";
import { PermitType, PermitStatus } from "@prisma/client";

/**
 * Map string permit types to Prisma enum
 */
function mapPermitType(type?: string): PermitType | undefined {
    if (!type) return undefined;

    const upperType = type.toUpperCase();
    const typeMap: Record<string, PermitType> = {
        BUILDING: PermitType.BUILDING,
        ELECTRICAL: PermitType.ELECTRICAL,
        PLUMBING: PermitType.PLUMBING,
        MECHANICAL: PermitType.MECHANICAL,
        ROOFING: PermitType.ROOFING,
        DEMOLITION: PermitType.DEMOLITION,
        OTHER: PermitType.OTHER,
    };

    return typeMap[upperType] || PermitType.OTHER;
}

/**
 * Map string status to Prisma enum
 */
function mapPermitStatus(status?: string): PermitStatus | undefined {
    if (!status) return undefined;

    const upperStatus = status.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const statusMap: Record<string, PermitStatus> = {
        DRAFT: PermitStatus.DRAFT,
        SUBMITTED: PermitStatus.SUBMITTED,
        IN_REVIEW: PermitStatus.IN_REVIEW,
        APPROVED: PermitStatus.APPROVED,
        ISSUED: PermitStatus.ISSUED,
        EXPIRED: PermitStatus.EXPIRED,
        REVOKED: PermitStatus.REVOKED,
        CANCELLED: PermitStatus.CANCELLED,
    };

    return statusMap[upperStatus] || PermitStatus.DRAFT;
}

/**
 * Save scraped permits to the database
 */
async function savePermits(permits: any[]): Promise<void> {
    let saved = 0;
    let skipped = 0;

    for (const permit of permits) {
        try {
            await prisma.permit.upsert({
                where: { permitNumber: permit.permitNumber },
                update: {
                    // Update existing permits
                    title: permit.title,
                    description: permit.description,
                    address: permit.address,
                    city: permit.city,
                    state: permit.state,
                    zipCode: permit.zipCode,
                    permitType: mapPermitType(permit.permitType),
                    status: mapPermitStatus(permit.status),
                    value: permit.value,
          issuedDate: permit.issuedDate,
          issuedDateString: permit.issuedDateString,
          expirationDate: permit.expirationDate,
                    sourceUrl: permit.sourceUrl,
                    scrapedAt: new Date(),
                },
                create: {
                    permitNumber: permit.permitNumber,
                    title: permit.title,
                    description: permit.description,
                    address: permit.address,
                    city: permit.city,
                    state: permit.state,
                    zipCode: permit.zipCode,
                    permitType: mapPermitType(permit.permitType),
                    status: mapPermitStatus(permit.status),
                    value: permit.value,
          issuedDate: permit.issuedDate,
          issuedDateString: permit.issuedDateString,
          expirationDate: permit.expirationDate,
                    sourceUrl: permit.sourceUrl,
                },
            });
            saved++;
        } catch (error) {
            console.error(`Error saving permit ${permit.permitNumber}:`, error);
            skipped++;
        }
    }

    console.log(`✅ Saved ${saved} permits, skipped ${skipped}`);
}

/**
 * Scrape permits for a specific city
 */
export async function scrapeCity(
    cityName: string,
    scrapeDate?: Date
): Promise<void> {
    const config = getCityConfig(cityName);

    if (!config) {
        throw new Error(`City not found in configuration: ${cityName}`);
    }

    if (!config.enabled) {
        console.log(`⏭️  Skipping ${cityName} - disabled in config`);
        return;
    }

    console.log(`🏙️  Starting scrape for ${cityName}...`);

    const extractor = createExtractor(config);
    const result = await extractor.scrape(scrapeDate);

    if (result.success && result.permits.length > 0) {
        await savePermits(result.permits);
        console.log(
            `✅ ${cityName} scrape complete: ${result.permits.length} permits`
        );
    } else {
        console.log(
            `⚠️  ${cityName} scrape failed: ${result.error || "No permits found"}`
        );
    }
}

/**
 * Scrape permits for all enabled cities
 */
export async function scrapeAllCities(scrapeDate?: Date): Promise<void> {
    console.log("🚀 Starting permit scraping for all cities...");

    const enabledCities = getEnabledCities();

    if (enabledCities.length === 0) {
        console.log("⚠️  No enabled cities configured");
        return;
    }

    for (const cityConfig of enabledCities) {
        try {
            await scrapeCity(cityConfig.city, scrapeDate);
        } catch (error) {
            console.error(`❌ Failed to scrape ${cityConfig.city}:`, error);
        }
    }

    console.log("✨ Scraping complete!");
}
