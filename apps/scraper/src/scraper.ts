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
import { initDebugLogging, closeDebugLogging, getDebugLogFile } from "./lib/contractor-matching";

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
 * Normalize date string to consistent MM/DD/YYYY format with leading zeros
 * Parses date components directly to avoid timezone shifts
 */
function normalizeDateString(dateString: string | null | undefined): string | undefined {
    if (!dateString) return undefined;
    
    try {
        const trimmed = dateString.trim();
        
        // Try to extract date parts directly from common formats
        // Handle formats like "1/3/2025", "01/03/2025", "2025-01-03", etc.
        const parts = trimmed.split(/[\/\-]/);
        if (parts.length === 3) {
            let month: number, day: number, year: number;
            
            // Check if first part is year (YYYY format like "2025-01-03")
            if (parts[0].length === 4) {
                year = parseInt(parts[0], 10);
                month = parseInt(parts[1], 10);
                day = parseInt(parts[2], 10);
            } else {
                // Assume MM/DD/YYYY or M/D/YYYY format (like "1/3/2025" or "01/03/2025")
                month = parseInt(parts[0], 10);
                day = parseInt(parts[1], 10);
                year = parseInt(parts[2], 10);
            }
            
            // Validate the parsed values
            if (!isNaN(month) && !isNaN(day) && !isNaN(year) && 
                month >= 1 && month <= 12 && day >= 1 && day <= 31 &&
                year >= 1900 && year <= 2100) {
                // Format as MM/DD/YYYY with leading zeros
                return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
            }
        }
        
        // If direct parsing fails, try Date constructor as fallback
        // But extract components using local timezone methods to avoid shifts
        const dateObj = new Date(trimmed);
        if (!isNaN(dateObj.getTime())) {
            // Use local date methods to avoid timezone conversion issues
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const year = dateObj.getFullYear();
            
            // Validate the date makes sense (not shifted)
            // Check if the original string components match what we extracted
            const originalParts = trimmed.split(/[\/\-]/);
            if (originalParts.length === 3) {
                let originalMonth: number, originalDay: number, originalYear: number;
                
                if (originalParts[0].length === 4) {
                    originalYear = parseInt(originalParts[0], 10);
                    originalMonth = parseInt(originalParts[1], 10);
                    originalDay = parseInt(originalParts[2], 10);
                } else {
                    originalMonth = parseInt(originalParts[0], 10);
                    originalDay = parseInt(originalParts[1], 10);
                    originalYear = parseInt(originalParts[2], 10);
                }
                
                // Only use Date constructor result if it matches the original components
                // This prevents timezone shifts
                if (!isNaN(originalMonth) && !isNaN(originalDay) && !isNaN(originalYear) &&
                    originalMonth === month && originalDay === day && originalYear === year) {
                    return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
                }
            }
        }
        
        return undefined;
    } catch {
        return undefined;
    }
}

/**
 * Save scraped permits to the database
 */
async function savePermits(permits: any[]): Promise<void> {
    let saved = 0;
    let skipped = 0;
    let withContractorText = 0;
    let matchedContractors = 0;

    for (const permit of permits) {
        try {
            // Track contractor text availability
            if (permit.licensedProfessionalText) {
                withContractorText++;
            }

            // Classify the permit using our classification service
            const permitData: PermitData = {
                permitNumber: permit.permitNumber,
                title: permit.title,
                description: permit.description,
                address: permit.address,
                city: permit.city,
                value: permit.value,
                rawExplicitType: permit.rawPropertyType || permit.permitType, // Use rawPropertyType if available (e.g., SUBTYPEDESCRIPTION), otherwise fall back to permitType
                rawPermitType: permit.permitType,
                licensedProfessionalText: permit.licensedProfessionalText, // Pass contractor info for matching
            };

            const classification =
                await permitClassificationService.classify(permitData);
            
            // Track successful contractor matches
            if (classification.contractorId) {
                matchedContractors++;
            }
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

            // Normalize appliedDateString to consistent MM/DD/YYYY format
            const validAppliedDateString = normalizeDateString(permit.appliedDateString);

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
    console.log(`📊 Contractor Matching Stats:`);
    console.log(`   - Permits with licensedProfessionalText: ${withContractorText} / ${permits.length}`);
    console.log(`   - Successfully matched to contractors: ${matchedContractors} / ${withContractorText}`);
    if (withContractorText > 0) {
        console.log(`   - Match rate: ${((matchedContractors / withContractorText) * 100).toFixed(1)}%`);
    }
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
 * Calculate the starting batch number for incremental scraping
 * @param suffix The numeric suffix of the largest existing permit (e.g., 19)
 * @param suffixDigits Number of digits in the pagestart (2 for Milpitas, 3 for Morgan Hill/Saratoga, 4 for Los Altos)
 * @returns The starting batch number
 * 
 * Logic:
 * - If suffix is the last number in its batch, start at the next batch
 * - Otherwise, start at the current batch (since the batch may not be fully scraped)
 * 
 * Examples:
 * - suffixDigits=3: suffix 19 (last in batch 001) -> start at batch 002
 * - suffixDigits=3: suffix 18 (in batch 001) -> start at batch 001
 * - suffixDigits=2: suffix 99 (last in batch 00) -> start at batch 01
 * - suffixDigits=2: suffix 98 (in batch 00) -> start at batch 00
 */
export function calculateStartingBatch(suffix: number, suffixDigits: number): number {
    let batchNumber: number;
    let isLastInBatch: boolean;
    
    if (suffixDigits === 2) {
        // Batches: 00 (001-099), 01 (100-199), etc.
        batchNumber = Math.floor(suffix / 100);
        isLastInBatch = suffix % 100 === 99;
    } else {
        // suffixDigits === 3 or 4: Batches: 000 (001-009), 001 (010-019), 002 (020-029), etc.
        batchNumber = Math.floor(suffix / 10);
        isLastInBatch = suffix % 10 === 9;
    }
    
    // If suffix is the last in its batch, start at the next batch
    // Otherwise, start at the current batch (may not be fully scraped)
    return isLastInBatch ? batchNumber + 1 : batchNumber;
}

/**
 * Scrape permits for a specific city
 */
export async function scrapeCity(
    cityName: string,
    limit?: number,
    startDate?: Date,
    endDate?: Date,
    contractorLimit?: number
): Promise<void> {
    // Initialize debug logging for contractor matching
    initDebugLogging();
    
    try {
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
                    
                    if (idBasedExtractor.getPermitPrefixes && idBasedExtractor.getConfig) {
                        const prefixes = idBasedExtractor.getPermitPrefixes(startDate);
                        const config = idBasedExtractor.getConfig();
                        const suffixDigits = config.suffixDigits;
                        
                        const startingBatchNumbers = new Map<string, number>();
                        for (const prefix of prefixes) {
                            const largestSuffix = await getLargestPermitSuffix(prefix, cityEnum);
                            if (largestSuffix !== null) {
                                const batchNumber = calculateStartingBatch(largestSuffix, suffixDigits);
                                startingBatchNumbers.set(prefix, batchNumber);
                                console.log(`📊 Starting batch for ${prefix}: ${batchNumber} (largest suffix: ${largestSuffix})`);
                            } else {
                                startingBatchNumbers.set(prefix, 0);
                                console.log(`📊 Starting batch for ${prefix}: 0 (no existing permits)`);
                            }
                        }
                        idBasedExtractor.startingBatchNumbers = startingBatchNumbers;
                        
                        // If limit is specified, load existing permit numbers to track new vs existing permits
                        if (limit) {
                            const existingPermits = await prisma.permit.findMany({
                                where: { city: cityEnum },
                                select: { permitNumber: true },
                            });
                            idBasedExtractor.existingPermitNumbers = new Set(
                                existingPermits.map(p => p.permitNumber)
                            );
                            console.log(`📋 Loaded ${existingPermits.length} existing permits for limit tracking`);
                        }
                    }
                }
            }
            
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
                
                // Automatically enrich with contractor information for cities that support it
                // if date range is provided
                if (startDate && endDate) {
                    const { supportsContractorEnrichment } = await import("./enrich-contractors.js");
                    if (supportsContractorEnrichment(cityName)) {
                        console.log(`\n🔗 Starting contractor enrichment for ${cityName}...`);
                        try {
                            const { enrichPermitsForCity } = await import("./enrich-contractors.js");
                            await enrichPermitsForCity(
                                cityName,
                                startDate,
                                endDate,
                                undefined, // contractorStartDate - use default (last 12 months)
                                undefined, // contractorEndDate - use default (last 12 months)
                                contractorLimit  // limit - use contractor limit if provided
                            );
                            console.log(`✅ Contractor enrichment complete for ${cityName}\n`);
                        } catch (error) {
                            console.error(`⚠️  Contractor enrichment failed for ${cityName}:`, error);
                            // Don't fail the entire scrape if enrichment fails
                        }
                    }
                }
            } else {
                console.log(
                    `⚠️  ${cityName} scrape failed: ${result.error || "No permits found"}`
                );
            }
        }
    } finally {
        // Close debug logging
        const debugLogFile = getDebugLogFile();
        closeDebugLogging();
        if (debugLogFile) {
            console.log(`📝 Contractor matching debug log saved to: ${debugLogFile}`);
        }
    }
}

/**
 * Scrape permits for all enabled cities
 */
export async function scrapeAllCities(
    limit?: number,
    startDate?: Date,
    endDate?: Date,
    contractorLimit?: number
): Promise<void> {
    console.log("🚀 Starting permit scraping for all cities...");

    const enabledCities = getEnabledCities();

    if (enabledCities.length === 0) {
        console.log("⚠️  No enabled cities configured");
        return;
    }

    for (const cityConfig of enabledCities) {
        try {
            await scrapeCity(cityConfig.city, limit, startDate, endDate, contractorLimit);
        } catch (error) {
            console.error(`❌ Failed to scrape ${cityConfig.city}:`, error);
        }
    }

    console.log("✨ Scraping complete!");
}
