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
     * @param limit Optional maximum number of permits to scrape (for testing)
     * @param startDate Optional start date - scrapes from beginning of startDate's month
     * @param endDate Optional end date - not currently used for monthly scrapers
     */
    abstract scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult>;

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
