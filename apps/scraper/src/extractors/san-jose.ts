/**
 * San Jose Extractor implementation
 * Uses HTTP requests to query the CKAN data portal API
 * No browser automation needed - direct JSON API access
 */

import { BaseDailyExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";

interface SanJoseAPIResponse {
    success: boolean;
    result: {
        records: SanJoseRecord[];
        fields?: Array<{ id: string; type: string }>;
    };
}

interface SanJoseRecord {
    _id: number;
    Status: string;
    gx_location: string;
    ASSESSORS_PARCEL_NUMBER?: string | null;
    APPLICANT?: string | null;
    OWNERNAME?: string | null;
    CONTRACTOR?: string | null;
    FOLDERNUMBER: string;
    FOLDERDESC?: string | null;
    FOLDERNAME?: string | null;
    SUBTYPEDESCRIPTION?: string | null;
    WORKDESCRIPTION?: string | null;
    PERMITAPPROVALS?: string | null;
    ISSUEDATE: string; // Format: "4/10/2018 12:00:00 AM"
    FINALDATE?: string | null; // Format: "4/10/2018 12:00:00 AM"
    DWELLINGUNITS?: string | null;
    PERMITVALUATION?: string | null;
    SQUAREFOOTAGE?: string | null;
    FOLDERRSN?: string | null;
}

export class SanJoseExtractor extends BaseDailyExtractor {
    // CKAN datastore resource ID for San Jose permits
    private readonly RESOURCE_ID = "761b7ae8-3be1-4ad6-923d-c7af6404a904";
    private readonly API_BASE_URL = "https://data.sanjoseca.gov/api/3/action/datastore_search_sql";

    /**
     * Normalize San Jose status text to our PermitStatus enum
     */
    private normalizeStatus(raw?: string): string {
        if (!raw) return "UNKNOWN";
        const s = raw.trim().toLowerCase();

        // ISSUED states
        if (
            s === "active" ||
            s.includes("issued") ||
            s.includes("approved") ||
            s.includes("complete")
        ) {
            return "ISSUED";
        }

        // IN_REVIEW states
        if (
            s.includes("pending") ||
            s.includes("processing") ||
            s.includes("review") ||
            s.includes("submitted") ||
            s.includes("incomplete")
        ) {
            return "IN_REVIEW";
        }

        // INACTIVE states
        if (
            s.includes("void") ||
            s.includes("expired") ||
            s.includes("revoked") ||
            s.includes("cancelled") ||
            s.includes("canceled") ||
            s.includes("closed")
        ) {
            return "INACTIVE";
        }

        return "UNKNOWN";
    }

    /**
     * Parse date string from San Jose format (M/D/YYYY 12:00:00 AM)
     */
    private parseDate(dateStr: string): Date | undefined {
        if (!dateStr) return undefined;
        
        // Format: "4/10/2018 12:00:00 AM"
        // Extract just the date part (before the time)
        const datePart = dateStr.split(' ')[0];
        if (!datePart) return undefined;

        // Parse M/D/YYYY format
        const parts = datePart.split('/');
        if (parts.length !== 3) return undefined;

        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        if (isNaN(month) || isNaN(day) || isNaN(year)) return undefined;

        // Create date (month is 0-indexed in JavaScript Date)
        const date = new Date(year, month - 1, day);
        return date;
    }

    /**
     * Format date for SQL query (M/D/YYYY format, matching database format)
     * Note: Database uses unpadded format (e.g., "4/10/2018" not "04/10/2018")
     */
    private formatDateForAPI(date: Date): string {
        const month = date.getMonth() + 1; // getMonth() is 0-indexed
        const day = date.getDate();
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    /**
     * Make HTTP request to San Jose API
     */
    private async queryAPI(sql: string): Promise<SanJoseAPIResponse> {
        const encodedSQL = encodeURIComponent(sql);
        const url = `${this.API_BASE_URL}?sql=${encodedSQL}`;

        console.log(`[SanJoseExtractor] Querying API: ${url.substring(0, 150)}...`);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as SanJoseAPIResponse;

        if (!data.success) {
            throw new Error(`API returned success=false`);
        }

        return data;
    }

    /**
     * Generate array of dates between startDate and endDate (inclusive)
     */
    private generateDateRange(startDate: Date, endDate: Date): Date[] {
        const dates: Date[] = [];
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        while (current <= end) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        
        return dates;
    }

    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
        try {
            console.log(`[SanJoseExtractor] Starting scrape for ${this.city}`);

            // San Jose API stores ISSUEDATE as text in "M/D/YYYY HH:MM:SS AM/PM" format
            // We need to use LIKE pattern matching instead of date comparisons
            // For date ranges, we'll query each date individually using LIKE 'M/D/YYYY%'
            
            let allRecords: SanJoseRecord[] = [];
            
            if (startDate && endDate) {
                // Both dates provided - query each date in the range
                const dates = this.generateDateRange(startDate, endDate);
                console.log(`[SanJoseExtractor] Scraping date range: ${this.formatDateForAPI(startDate)} to ${this.formatDateForAPI(endDate)} (${dates.length} days)`);
                
                for (const date of dates) {
                    const dateStr = this.formatDateForAPI(date);
                    const sql = `SELECT * FROM "${this.RESOURCE_ID}" WHERE "ISSUEDATE" LIKE '${dateStr}%'`;
                    
                    const apiResponse = await this.queryAPI(sql);
                    allRecords.push(...apiResponse.result.records);
                }
            } else if (startDate) {
                // Only start date provided - scrape from startDate onwards
                // Query day by day from startDate to today (or a reasonable future date)
                const today = new Date();
                today.setHours(23, 59, 59, 999);
                const effectiveEndDate = today;
                const dates = this.generateDateRange(startDate, effectiveEndDate);
                console.log(`[SanJoseExtractor] Scraping from ${this.formatDateForAPI(startDate)} onwards (${dates.length} days)`);
                
                for (const date of dates) {
                    const dateStr = this.formatDateForAPI(date);
                    const sql = `SELECT * FROM "${this.RESOURCE_ID}" WHERE "ISSUEDATE" LIKE '${dateStr}%'`;
                    
                    const apiResponse = await this.queryAPI(sql);
                    allRecords.push(...apiResponse.result.records);
                }
            } else {
                // No date provided - scrape today only
                const todayStr = this.formatDateForAPI(new Date());
                console.log(`[SanJoseExtractor] Scraping today: ${todayStr}`);
                
                const sql = `SELECT * FROM "${this.RESOURCE_ID}" WHERE "ISSUEDATE" LIKE '${todayStr}%'`;
                const apiResponse = await this.queryAPI(sql);
                allRecords.push(...apiResponse.result.records);
            }
            
            console.log(`[SanJoseExtractor] API returned ${allRecords.length} records total`);

            // Parse permit data
            const allPermits = await this.parsePermitData(allRecords, limit);

            console.log(`[SanJoseExtractor] Scraped ${allPermits.length} permits total`);

            // Apply limit if specified (already applied in parsePermitData, but keep for consistency)
            const permits = limit && limit > 0 
                ? allPermits.slice(0, limit)
                : allPermits;

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            console.error(`[SanJoseExtractor] Error during scrape:`, error);
            return {
                permits: [],
                success: false,
                error: error.message || "Unknown error",
                scrapedAt: new Date(),
            };
        }
    }

    protected async parsePermitData(rawData: SanJoseRecord[], limit?: number): Promise<PermitData[]> {
        const permits: PermitData[] = [];

        for (let i = 0; i < rawData.length; i++) {
            if (limit && permits.length >= limit) break;

            const record = rawData[i];

            try {
                // Extract permit number (FOLDERNUMBER)
                const permitNumber = record.FOLDERNUMBER?.trim();
                if (!permitNumber) {
                    console.warn(`[SanJoseExtractor] Skipping record without permit number`);
                    continue;
                }

                // Parse dates
                const appliedDate = record.ISSUEDATE ? this.parseDate(record.ISSUEDATE) : undefined;
                const appliedDateString = record.ISSUEDATE ? record.ISSUEDATE.split(' ')[0] : undefined;
                const expirationDate = record.FINALDATE ? this.parseDate(record.FINALDATE) : undefined;

                // Parse valuation
                let value: number | undefined;
                if (record.PERMITVALUATION) {
                    const parsed = parseFloat(record.PERMITVALUATION);
                    if (!isNaN(parsed) && parsed > 0) {
                        value = parsed;
                    }
                }

                // Extract address from gx_location
                // Format appears to be: "ADDRESS , CITY STATE ZIP"
                const address = record.gx_location?.trim() || undefined;
                let zipCode: string | undefined;
                if (address) {
                    // Try to extract ZIP from address (last part after last comma or dash)
                    const zipMatch = address.match(/\b(\d{5}(?:-\d{4})?)\b/);
                    if (zipMatch) {
                        // Only keep the first 5 digits (e.g., "95126-1804" -> "95126")
                        zipCode = zipMatch[1].substring(0, 5);
                    }
                }

                // Extract status
                const status = this.normalizeStatus(record.Status);

                // Extract description (prefer WORKDESCRIPTION, fallback to FOLDERNAME or FOLDERDESC)
                const description = record.WORKDESCRIPTION?.trim() || 
                                   record.FOLDERNAME?.trim() || 
                                   record.FOLDERDESC?.trim() || 
                                   undefined;

                // Extract permit type from FOLDERDESC (not SUBTYPEDESCRIPTION, which is property type)
                const permitType = record.FOLDERDESC?.trim() || undefined;

                // SUBTYPEDESCRIPTION is the property type (e.g., "Single-Family", "Apartment")
                const propertyTypeDescription = record.SUBTYPEDESCRIPTION?.trim() || undefined;

                const permit: PermitData = {
                    permitNumber,
                    title: permitType, // Use permit type for title
                    description,
                    address,
                    city: "San Jose", // Ensure city is set to "San Jose"
                    state: this.state,
                    zipCode,
                    permitType,
                    status,
                    value,
                    appliedDate,
                    appliedDateString,
                    expirationDate,
                    sourceUrl: this.url,
                    licensedProfessionalText: record.CONTRACTOR?.trim() || undefined,
                    rawPropertyType: propertyTypeDescription, // SUBTYPEDESCRIPTION for property type classification
                };

                if (this.validatePermitData(permit)) {
                    permits.push(permit);
                } else {
                    console.warn(`[SanJoseExtractor] Invalid permit data for ${permitNumber}`);
                }
            } catch (error: any) {
                console.warn(`[SanJoseExtractor] Error parsing record ${i + 1}:`, error.message);
            }
        }

        return permits;
    }
}

