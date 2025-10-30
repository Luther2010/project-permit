/**
 * Main scraper orchestrator
 * Orchestrates scraping across all enabled cities
 */

import { getEnabledCities, getCityConfig } from "./config/cities";
import { createExtractor } from "./extractor-factory";
import { prisma } from "./lib/db";
import { PermitType, PermitStatus, PropertyType } from "@prisma/client";
import { permitClassificationService, type PermitData } from "./lib/permit-classification";

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
            // Classify the permit using our classification service
            const permitData: PermitData = {
                permitNumber: permit.permitNumber,
                title: permit.title,
                description: permit.description,
                address: permit.address,
                city: permit.city,
                value: permit.value,
                rawExplicitType: permit.permitType, // Pass the raw type from scraper
                rawPermitType: permit.permitType,
            };

            const classification = await permitClassificationService.classify(permitData);
            console.log(
                `🔎 Classification for ${permit.permitNumber}: propertyType=${classification.propertyType} permitType=${classification.permitType} contractorId=${classification.contractorId}`
            );
            
            console.log(`📋 Classified ${permit.permitNumber}: ${classification.propertyType}/${classification.permitType} (confidence: ${classification.confidence.toFixed(2)})`);
            if (classification.reasoning.length > 0) {
                console.log(`   Reasoning: ${classification.reasoning.join(', ')}`);
            }

            // Convert null to undefined for Prisma (optional fields should be undefined, not null)
            const propertyType = classification.propertyType ?? undefined;
            const permitType = classification.permitType ?? undefined;
            const status = mapPermitStatus(permit.status) ?? undefined;

            // Validate dates are valid Date objects and within reasonable range
            const validateDate = (date: Date | undefined): Date | undefined => {
                if (!date) return undefined;
                if (!(date instanceof Date) || isNaN(date.getTime())) {
                    return undefined;
                }
                const year = date.getFullYear();
                if (year < 1900 || year >= 2100) {
                    return undefined;
                }
                return date;
            };

            const validIssuedDate = validateDate(permit.issuedDate);
            const validExpirationDate = validateDate(permit.expirationDate);

            // Ensure issuedDateString is a string, not a number
            const validIssuedDateString = permit.issuedDateString 
                ? String(permit.issuedDateString).trim() 
                : undefined;

            const savedPermit = await prisma.permit.upsert({
                where: { permitNumber: permit.permitNumber },
                update: {
                    // Update existing permits
                    title: permit.title,
                    description: permit.description,
                    address: permit.address,
                    city: permit.city,
                    state: permit.state,
                    zipCode: permit.zipCode,
                    propertyType,
                    permitType,
                    status,
                    value: permit.value,
                    issuedDate: validIssuedDate,
                    issuedDateString: validIssuedDateString,
                    expirationDate: validExpirationDate,
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
                    propertyType,
                    permitType,
                    status,
                    value: permit.value,
                    issuedDate: validIssuedDate,
                    issuedDateString: validIssuedDateString,
                    expirationDate: validExpirationDate,
                    sourceUrl: permit.sourceUrl,
                },
            });
            saved++;

            // Link contractors if license info is present
            try {
                const linkByLicense = async (licenseNoRaw?: string, role?: string) => {
                    const licenseNo = licenseNoRaw?.trim();
                    if (!licenseNo) return;
                    const contractor = await prisma.contractor.findUnique({
                        where: { licenseNo },
                        select: { id: true },
                    });
                    if (!contractor) return;
                    await prisma.permitContractor.upsert({
                        where: {
                            permitId_contractorId: {
                                permitId: savedPermit.id,
                                contractorId: contractor.id,
                            },
                        },
                        update: { role: role || undefined },
                        create: {
                            permitId: savedPermit.id,
                            contractorId: contractor.id,
                            role: role || undefined,
                        },
                    });
                };

                // Support single license field
                let linkedAny = false;
                // Or an array of contractors
                if (Array.isArray(permit.contractors)) {
                    for (const c of permit.contractors) {
                        await linkByLicense(c?.licenseNo, c?.role);
                        linkedAny = true;
                    }
                }
                // If classifier provided a contractorId, link it
                if (!linkedAny && classification.contractorId) {
                    await prisma.permitContractor.upsert({
                        where: {
                            permitId_contractorId: {
                                permitId: savedPermit.id,
                                contractorId: classification.contractorId,
                            },
                        },
                        update: {},
                        create: {
                            permitId: savedPermit.id,
                            contractorId: classification.contractorId,
                        },
                    });
                    console.log(
                        `🔗 Linked permit ${permit.permitNumber} to contractor ${classification.contractorId} (from classifier)`
                    );
                    linkedAny = true;
                }
                if (!linkedAny) {
                    console.log(
                        `ℹ️  No contractor link created for ${permit.permitNumber}`
                    );
                }
            } catch (e) {
                console.warn(
                    `⚠️  Could not link contractor(s) for ${permit.permitNumber}:`,
                    e
                );
            }
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
