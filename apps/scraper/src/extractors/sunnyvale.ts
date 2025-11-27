/**
 * Sunnyvale Extractor implementation
 * Uses Puppeteer to interact with Energov/Tyler Technologies portal
 * Parses HTML results directly from search page (no CSV export available)
 */

import { EnergovBaseExtractor } from "./energov-base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";

export class SunnyvaleExtractor extends EnergovBaseExtractor {
    private readonly baseUrl = "https://sunnyvaleca-energovpub.tylerhost.net";

    protected getBaseUrl(): string {
        return this.baseUrl;
    }

    /**
     * Sunnyvale doesn't allow anonymous users to access the "More Info" tab
     * Skip contractor license extraction to avoid errors and improve performance
     */
    protected shouldExtractContractorInfo(): boolean {
        return false;
    }

    /**
     * Temporarily disable detail page extraction for Sunnyvale to avoid rate limiting
     */
    protected shouldExtractDetailPageData(): boolean {
        return false;
    }
}
