/**
 * Base extractor interface that all city extractors must implement
 */

import { PermitData, ScrapeResult } from "./types";

export abstract class BaseExtractor {
    protected city: string;
    protected state: string;
    protected url: string;

    constructor(city: string, state: string, url: string) {
        this.city = city;
        this.state = state;
        this.url = url;
    }

    /**
     * Main method to scrape permits
     * Each extractor implements this differently based on the city's website structure
     * @param limit Optional maximum number of permits to scrape (for testing)
     * @param startDate Optional start date for date range scraping
     * @param endDate Optional end date for date range scraping
     */
    abstract scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult>;

    /**
     * Parse permit data from HTML or API response
     * Extractors override this to parse their specific data format
     * @param limit Optional maximum number of permits to process (for testing)
     */
    protected abstract parsePermitData(rawData: any, limit?: number): Promise<PermitData[]>;

    /**
     * Validate that extracted permit data is valid
     */
    protected validatePermitData(permit: PermitData): boolean {
        return !!(permit.permitNumber && permit.city && permit.state);
    }

    /**
     * Get the extractor name
     */
    getName(): string {
        return this.constructor.name;
    }
}

/**
 * Base class for daily scrapers that can scrape permits by specific date
 */
export abstract class BaseDailyExtractor extends BaseExtractor {
    /**
     * Main method to scrape permits by date
     * @param limit Optional maximum number of permits to scrape (for testing)
     * @param startDate Optional start date for date range scraping
     * @param endDate Optional end date for date range scraping
     */
    abstract scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult>;
}

/**
 * Base class for monthly scrapers that can only scrape by month/year
 */
export abstract class BaseMonthlyExtractor extends BaseExtractor {
    /**
     * Main method to scrape permits by month/year
     * Handles multi-month date ranges by looping through each month
     * @param limit Optional maximum number of permits to scrape (for testing)
     * @param startDate Optional start date - scrapes from beginning of startDate's month
     * @param endDate Optional end date - if provided, scrapes all months in the range
     */
    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
        try {
            let allPermits: PermitData[] = [];

            // If both startDate and endDate are provided, scrape all months in the range
            if (startDate && endDate) {
                const months = this.generateMonthRange(startDate, endDate);
                console.log(`[${this.getName()}] Scraping ${months.length} month(s) from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
                
                for (const targetDate of months) {
                    console.log(`[${this.getName()}] Scraping month: ${targetDate.getMonth() + 1}/${targetDate.getFullYear()}`);
                    
                    try {
                        const monthResult = await this.scrapeMonth(targetDate, startDate, endDate);
                        if (monthResult.success && monthResult.permits) {
                            allPermits.push(...monthResult.permits);
                        } else if (!monthResult.success) {
                            console.warn(`[${this.getName()}] Failed to scrape ${targetDate.getMonth() + 1}/${targetDate.getFullYear()}: ${monthResult.error || 'Unknown error'}`);
                        }
                    } catch (error: any) {
                        console.warn(`[${this.getName()}] Error scraping ${targetDate.getMonth() + 1}/${targetDate.getFullYear()}: ${error.message || 'Unknown error'}`);
                    }
                }
            } else {
                // Single month scrape (backward compatibility)
                const { month, year } = this.getMonthYear(startDate);
                const targetDate = new Date(year, month - 1, 1);
                const result = await this.scrapeMonth(targetDate, startDate, endDate);
                if (result.success && result.permits) {
                    allPermits = result.permits;
                } else {
                    return result;
                }
            }

            // Apply limit if specified
            if (limit && allPermits.length > limit) {
                allPermits = allPermits.slice(0, limit);
            }

            return {
                permits: allPermits,
                success: true,
                scrapedAt: new Date(),
            };
        } finally {
            // Cleanup resources (browser, etc.) if cleanup method exists
            if (typeof (this as any).cleanup === 'function') {
                await (this as any).cleanup();
            }
        }
    }

    /**
     * Scrape permits for a specific month
     * Subclasses must implement this to handle city-specific logic
     * @param targetDate First day of the target month
     * @param startDate Original start date (for filtering permits)
     * @param endDate Original end date (for filtering permits)
     */
    protected abstract scrapeMonth(targetDate: Date, startDate?: Date, endDate?: Date): Promise<ScrapeResult>;

    /**
     * Generate array of month/year dates between startDate and endDate
     */
    protected generateMonthRange(startDate: Date, endDate: Date): Date[] {
        const months: Date[] = [];
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        
        while (current <= end) {
            months.push(new Date(current));
            current.setMonth(current.getMonth() + 1);
        }
        
        return months;
    }

    /**
     * Extract month and year from a date (defaults to current month if not provided)
     */
    protected getMonthYear(scrapeDate?: Date): { month: number; year: number } {
        const date = scrapeDate || new Date();
        return {
            month: date.getMonth() + 1, // 1-12
            year: date.getFullYear(),
        };
    }
}
