/**
 * Main scraper orchestrator
 * Orchestrates scraping across all enabled cities
 */

import { getEnabledCities, getCityConfig } from "./config/cities";
import { createExtractor } from "./extractor-factory";
import { prisma } from "./lib/db";
import { PermitType, PermitStatus, PropertyType, City } from "@prisma/client";
import { normalizeAccelaStatus } from "./utils/accela-status";
import {
    permitClassificationService,
    type PermitData,
} from "./lib/permit-classification";
import { ScraperType } from "./types";

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
 * Map city name string to City enum
 */
function mapCity(cityName?: string): City | undefined {
    if (!cityName) return undefined;
    
    const normalized = cityName.trim().toUpperCase();
    const cityMap: Record<string, City> = {
        "LOS GATOS": City.LOS_GATOS,
        "SARATOGA": City.SARATOGA,
        "SANTA CLARA": City.SANTA_CLARA,
        "CUPERTINO": City.CUPERTINO,
        "PALO ALTO": City.PALO_ALTO,
        "LOS ALTOS HILLS": City.LOS_ALTOS_HILLS,
        "SUNNYVALE": City.SUNNYVALE,
        "SAN JOSE": City.SAN_JOSE,
        "CAMPBELL": City.CAMPBELL,
        "MOUNTAIN VIEW": City.MOUNTAIN_VIEW,
        "GILROY": City.GILROY,
        "MILPITAS": City.MILPITAS,
        "MORGAN HILL": City.MORGAN_HILL,
        "LOS ALTOS": City.LOS_ALTOS,
    };
    
    // Also try with underscores (in case it's already normalized)
    const normalizedWithUnderscores = cityName.toUpperCase().replace(/\s+/g, '_');
    if (cityMap[normalizedWithUnderscores]) {
        return cityMap[normalizedWithUnderscores];
    }
    
    return cityMap[normalized];
}

/**
 * Map string status to Prisma enum
 * If status is already a valid PermitStatus enum value, use it directly.
 * Otherwise, normalize it from raw status text.
 */
function mapPermitStatus(status?: string): PermitStatus {
    if (!status) return PermitStatus.UNKNOWN;

    // Check if status is already a valid PermitStatus enum value
    const validStatuses = Object.values(PermitStatus);
    if (validStatuses.includes(status as PermitStatus)) {
        return status as PermitStatus;
    }

    // Otherwise, normalize from raw status text
    return normalizeAccelaStatus(status);
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

            const classification =
                await permitClassificationService.classify(permitData);
            console.log(
                `🔎 Classification for ${permit.permitNumber}: propertyType=${classification.propertyType} permitType=${classification.permitType} contractorId=${classification.contractorId}`
            );

            console.log(
                `📋 Classified ${permit.permitNumber}: ${classification.propertyType}/${classification.permitType} (confidence: ${classification.confidence.toFixed(2)})`
            );
            if (classification.reasoning.length > 0) {
                console.log(
                    `   Reasoning: ${classification.reasoning.join(", ")}`
                );
            }

            // Convert null to undefined for Prisma (optional fields should be undefined, not null)
            const propertyType = classification.propertyType ?? undefined;
            const permitType = classification.permitType ?? undefined;
            const status = permit.status
                ? mapPermitStatus(permit.status)
                : PermitStatus.UNKNOWN;
            const city = mapCity(permit.city);

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

            const validAppliedDate = validateDate(permit.appliedDate);
            const validExpirationDate = validateDate(permit.expirationDate);

            // Ensure appliedDateString is a string, not a number
            const validAppliedDateString = permit.appliedDateString
                ? String(permit.appliedDateString).trim()
                : undefined;

            const savedPermit = await prisma.permit.upsert({
                where: { permitNumber: permit.permitNumber },
                update: {
                    // Update existing permits
                    title: permit.title,
                    description: permit.description,
                    address: permit.address,
                    city: city,
                    state: permit.state,
                    zipCode: permit.zipCode,
                    propertyType,
                    permitType,
                    status,
                    value: permit.value,
                    appliedDate: validAppliedDate,
                    appliedDateString: validAppliedDateString,
                    expirationDate: validExpirationDate,
                    sourceUrl: permit.sourceUrl,
                    scrapedAt: new Date(),
                },
                create: {
                    permitNumber: permit.permitNumber,
                    title: permit.title,
                    description: permit.description,
                    address: permit.address,
                    city: city,
                    state: permit.state,
                    zipCode: permit.zipCode,
                    propertyType,
                    permitType,
                    status,
                    value: permit.value,
                    appliedDate: validAppliedDate,
                    appliedDateString: validAppliedDateString,
                    expirationDate: validExpirationDate,
                    sourceUrl: permit.sourceUrl,
                },
            });
            saved++;

            // Link contractors if license info is present
            try {
                const linkByLicense = async (
                    licenseNoRaw?: string,
                    role?: string
                ) => {
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
 * Get the largest permit number suffix for a given prefix from the database
 * Returns the numeric suffix (e.g., for "BCOM2025-0051", returns 51)
 */
export async function getLargestPermitSuffix(prefix: string, city: City): Promise<number | null> {
    try {
        // Find all permits for this city that start with the prefix
        const permits = await prisma.permit.findMany({
            where: {
                city: city,
                permitNumber: {
                    startsWith: prefix,
                },
            },
            select: {
                permitNumber: true,
            },
        });

        if (permits.length === 0) {
            return null;
        }

        // Extract numeric suffixes and find the largest
        let maxSuffix = 0;
        for (const permit of permits) {
            // Extract suffix after the prefix (e.g., "BCOM2025-0051" -> "0051")
            // Handle both with and without dash: "BCOM2025-0051" or "BCOM20250051"
            const match = permit.permitNumber.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-?(\\d+)$`));
            if (match && match[1]) {
                const suffix = parseInt(match[1], 10);
                if (!isNaN(suffix) && suffix > maxSuffix) {
                    maxSuffix = suffix;
                }
            }
        }

        return maxSuffix > 0 ? maxSuffix : null;
    } catch (error) {
        console.warn(`⚠️  Error getting largest permit suffix for ${prefix}:`, error);
        return null;
    }
}

/**
 * Round down a permit suffix to the nearest pagestart
 * @param suffix The numeric suffix (e.g., 51)
 * @param suffixDigits Number of digits in the pagestart (2 for Milpitas, 3 for Morgan Hill, 4 for Los Altos)
 * @returns The pagestart batch number (e.g., for suffixDigits=3, 51 -> 50, so returns 5 for batch "005")
 */
export function roundDownToPagestart(suffix: number, suffixDigits: number): number {
    // For 2 digits: round down to nearest 100, then divide by 100 to get batch number
    // (e.g., 51 -> 0, 151 -> 1, so batch "00" or "01")
    // For 3 digits: round down to nearest 10, then divide by 10 to get batch number
    // (e.g., 51 -> 50 -> 5, so batch "005")
    // For 4 digits: round down to nearest 10, then divide by 10 to get batch number
    // (e.g., 51 -> 50 -> 5, so batch "0005")
    if (suffixDigits === 2) {
        return Math.floor(suffix / 100);
    } else {
        // 3 or 4 digits: round down to nearest 10, then divide by 10
        return Math.floor(suffix / 10);
    }
}

/**
 * Scrape permits for a specific city
 */
export async function scrapeCity(
    cityName: string,
    limit?: number,
    startDate?: Date,
    endDate?: Date
): Promise<void> {
    const config = getCityConfig(cityName);

    if (!config) {
        throw new Error(`City not found in configuration: ${cityName}`);
    }

    if (!config.enabled) {
        console.log(`⏭️  Skipping ${cityName} - disabled in config`);
        return;
    }

    // Provide appropriate messaging based on scraper type
    let dateMessage = "";
    if (startDate && endDate) {
        if (config.scraperType === ScraperType.MONTHLY) {
            const month = startDate.toLocaleString('default', { month: 'long' });
            const year = startDate.getFullYear();
            dateMessage = ` for ${month} ${year}`;
        } else if (config.scraperType === ScraperType.ID_BASED) {
            const year = startDate.getFullYear();
            dateMessage = ` for year ${year}`;
        } else {
            dateMessage = ` (range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]})`;
        }
    } else if (startDate) {
        if (config.scraperType === ScraperType.MONTHLY) {
            const month = startDate.toLocaleString('default', { month: 'long' });
            const year = startDate.getFullYear();
            dateMessage = ` for ${month} ${year}`;
        } else if (config.scraperType === ScraperType.ID_BASED) {
            const year = startDate.getFullYear();
            dateMessage = ` for year ${year}`;
        } else {
            dateMessage = ` (from: ${startDate.toISOString().split("T")[0]})`;
        }
    }
    
    console.log(`🏙️  Starting scrape for ${cityName}${dateMessage}...`);

    const extractor = createExtractor(config);
    
    // For ID-based scrapers, implement incremental scraping
    if (config.scraperType === ScraperType.ID_BASED && startDate) {
        // Calculate starting batch numbers for each prefix
        const { EtrakitIdBasedExtractor } = await import("./extractors/etrakit-id-based-extractor.js");
        if (extractor instanceof EtrakitIdBasedExtractor) {
            const cityEnum = mapCity(cityName);
            if (cityEnum) {
                // Use type assertion to access protected methods for incremental scraping
                // Cast to any to access protected members, then cast to specific interface
                const idBasedExtractor = extractor as any;
                
                if (idBasedExtractor.getPermitPrefixes && idBasedExtractor.getSuffixDigits) {
                    const prefixes = idBasedExtractor.getPermitPrefixes(startDate);
                    const suffixDigits = idBasedExtractor.getSuffixDigits();
                    
                    const startingBatchNumbers = new Map<string, number>();
                    for (const prefix of prefixes) {
                        const largestSuffix = await getLargestPermitSuffix(prefix, cityEnum);
                        if (largestSuffix !== null) {
                            const batchNumber = roundDownToPagestart(largestSuffix, suffixDigits);
                            startingBatchNumbers.set(prefix, batchNumber);
                            console.log(`📊 Starting batch for ${prefix}: ${batchNumber} (largest suffix: ${largestSuffix})`);
                        } else {
                            startingBatchNumbers.set(prefix, 0);
                            console.log(`📊 Starting batch for ${prefix}: 0 (no existing permits)`);
                        }
                    }
                    idBasedExtractor.startingBatchNumbers = startingBatchNumbers;
                }
            }
        }
        
        const result = await extractor.scrape(limit, startDate, endDate);
        
        // For ID-based scrapers, the extractor handles date filtering internally
        // No need to filter again here as the extractor already filters by appliedDate
        
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
    } else {
        // For daily and monthly scrapers
        // The extractors handle date filtering at the search level (e.g., setting date ranges in search forms)
        // No need to filter again here as the search itself is already filtered
        const result = await extractor.scrape(limit, startDate, endDate);

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
}

/**
 * Scrape permits for all enabled cities
 */
export async function scrapeAllCities(
    limit?: number,
    startDate?: Date,
    endDate?: Date
): Promise<void> {
    console.log("🚀 Starting permit scraping for all cities...");

    const enabledCities = getEnabledCities();

    if (enabledCities.length === 0) {
        console.log("⚠️  No enabled cities configured");
        return;
    }

    for (const cityConfig of enabledCities) {
        try {
            await scrapeCity(cityConfig.city, limit, startDate, endDate);
        } catch (error) {
            console.error(`❌ Failed to scrape ${cityConfig.city}:`, error);
        }
    }

    console.log("✨ Scraping complete!");
}
