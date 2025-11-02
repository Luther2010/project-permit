/**
 * Gilroy Extractor implementation
 * Uses Puppeteer to interact with Energov/Tyler Technologies portal
 * Same system as Sunnyvale
 */

import { EnergovBaseExtractor } from "./energov-base-extractor";
import { ScrapeResult } from "../types";
import puppeteer from "puppeteer";

export class GilroyExtractor extends EnergovBaseExtractor {
    private readonly baseUrl = "https://gilroyca-energovweb.tylerhost.net";

    protected getBaseUrl(): string {
        return this.baseUrl;
    }

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            // Launch browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Navigate to search page
            await this.page.goto(this.url, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            // Calculate date to search
            const searchDate = scrapeDate || new Date();
            const dateStr = this.formatDate(searchDate);

            // Set up search filters
            await this.setupSearchFilters(this.page, dateStr);

            // Perform search
            await this.performSearch(this.page);

            // Parse permits from all pages
            const permits = await this.navigatePages(this.page, limit);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            return {
                permits: [],
                success: false,
                error: error.message,
                scrapedAt: new Date(),
            };
        } finally {
            await this.cleanup();
        }
    }
}

