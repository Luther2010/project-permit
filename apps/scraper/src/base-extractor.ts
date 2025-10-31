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
     * @param scrapeDate Optional specific date to scrape for
     * @param limit Optional maximum number of permits to scrape (for testing)
     */
    abstract scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult>;

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
