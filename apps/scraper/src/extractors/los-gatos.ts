/**
 * Los Gatos Extractor implementation
 * Uses Puppeteer to interact with the Accela Civic Platform
 * Since the site doesn't support URL-based search, we need to fill in the date field in the UI
 */

import { BaseExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";

export class LosGatosExtractor extends BaseExtractor {
    private browser: Browser | null = null;
    private page: Page | null = null;

    async scrape(): Promise<ScrapeResult> {
        try {
            console.log(`[LosGatosExtractor] Starting scrape for ${this.city}`);

            // Launch browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            this.page = await this.browser.newPage();

            // Set viewport
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Navigate to the permit search page
            await this.page.goto(this.url, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            console.log(
                `[LosGatosExtractor] Page loaded, looking for date field...`
            );

            // Calculate the date range (last 30 days from today)
            const today = new Date();
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(today.getDate() - 30);

            const startDate = this.formatDateForAccela(thirtyDaysAgo);

            console.log(
                `[LosGatosExtractor] Searching for permits from ${startDate}`
            );

            // Wait for the page to be interactive
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Find and fill the start date field by looking for labels
            const startDateValue = await this.page.evaluate((date) => {
                const labels = Array.from(
                    (globalThis as any).document.querySelectorAll("label")
                ) as any[];
                const startDateLabel = labels.find(
                    (l: any) => l.textContent?.trim() === "Start Date:"
                );

                if (startDateLabel && startDateLabel.htmlFor) {
                    const input = (globalThis as any).document.querySelector(
                        `input[name="${startDateLabel.htmlFor}"], #${startDateLabel.htmlFor}`
                    ) as any;
                    if (input) {
                        input.value = date;
                        input.dispatchEvent(
                            new Event("input", { bubbles: true })
                        );
                        input.dispatchEvent(
                            new Event("change", { bubbles: true })
                        );
                        return true;
                    }
                }
                return false;
            }, startDate);

            if (startDateValue) {
                console.log(
                    `[LosGatosExtractor] Filled start date: ${startDate}`
                );

                // Fill end date (today)
                const endDate = this.formatDateForAccela(new Date());
                await this.page.evaluate((date) => {
                    const labels = Array.from(
                        (globalThis as any).document.querySelectorAll("label")
                    ) as any[];
                    const endDateLabel = labels.find((l: any) =>
                        l.textContent?.toLowerCase().includes("end date")
                    );
                    if (endDateLabel && endDateLabel.htmlFor) {
                        const input = (
                            globalThis as any
                        ).document.querySelector(
                            `input[name="${endDateLabel.htmlFor}"], #${endDateLabel.htmlFor}`
                        ) as any;
                        if (input) {
                            input.value = date;
                            input.dispatchEvent(
                                new Event("input", { bubbles: true })
                            );
                            input.dispatchEvent(
                                new Event("change", { bubbles: true })
                            );
                        }
                    }
                }, endDate);

                console.log(`[LosGatosExtractor] Filled end date: ${endDate}`);
            } else {
                console.log(`[LosGatosExtractor] Could not find date fields`);
                await this.page.screenshot({
                    path: "los-gatos-page.png",
                    fullPage: true,
                });
            }

            // Try to find and click the search button
            const searchSelectors = [
                "#ctl00_PlaceHolderMain_btnNewSearch", // Los Gatos specific
                'a[title="Search"]',
                'a:has(span:contains("Search"))',
                'input[type="submit"][value*="Search"]',
                'input[type="button"][value*="Search"]',
                'button[type="submit"]',
                'input[name*="search"]',
                "#searchButton",
            ];

            let searchClicked = false;
            for (const selector of searchSelectors) {
                try {
                    const searchButton = await this.page.$(selector);
                    if (searchButton) {
                        console.log(
                            `[LosGatosExtractor] Found search button with selector: ${selector}`
                        );
                        await searchButton.click();
                        searchClicked = true;
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }

            if (!searchClicked) {
                console.log(
                    `[LosGatosExtractor] Could not find search button automatically`
                );
            }

            // Wait for results to load
            await new Promise((resolve) => setTimeout(resolve, 5000));

            let permits: PermitData[] = [];
            let currentPage = 1;
            let hasMorePages = true;

            // Handle pagination
            while (hasMorePages && currentPage <= 100) {
                console.log(`[LosGatosExtractor] Scraping page ${currentPage}`);

                // Wait for table to load
                try {
                    await this.page.waitForSelector("table tbody tr", {
                        timeout: 10000,
                    });
                } catch {
                    console.log(`[LosGatosExtractor] No results table found`);
                    break;
                }

                // Extract data from current page
                const pageContent = await this.page.content();
                const pagePermits = this.parsePermitData(pageContent);
                console.log(
                    `[LosGatosExtractor] Found ${pagePermits.length} permits on page ${currentPage}`
                );

                permits = permits.concat(pagePermits);

                // Take screenshot of first page
                if (currentPage === 1) {
                    await this.page.screenshot({
                        path: "los-gatos-results.png",
                        fullPage: true,
                    });
                }

                // Check for next page button
                hasMorePages = await this.page.evaluate(() => {
                    // Find "Next >" link
                    const links = Array.from(
                        (globalThis as any).document.querySelectorAll(
                            "a.aca_pagination_PrevNext, a.aca_simple_text"
                        )
                    ) as any[];
                    const nextButton = links.find(
                        (el: any) =>
                            el.textContent?.includes("Next") &&
                            !el.textContent?.includes("Prev")
                    );

                    if (nextButton) {
                        nextButton.click();
                        return true;
                    }
                    return false;
                });

                if (hasMorePages) {
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    currentPage++;
                }
            }

            console.log(
                `[LosGatosExtractor] Total: ${permits.length} permits from ${currentPage} pages`
            );

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error) {
            console.error(`[LosGatosExtractor] Error:`, error);
            return {
                permits: [],
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                scrapedAt: new Date(),
            };
        } finally {
            // Clean up
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    protected parsePermitData(rawData: any): PermitData[] {
        const permits: PermitData[] = [];
        const $ = cheerio.load(rawData);

        // Find all table rows in the results
        $("tr.ACA_TabRow_Odd, tr.ACA_TabRow_Even").each((i, row) => {
            const $row = $(row);

            // Extract permit number
            const permitNumber = $row
                .find('span[id*="lblPermitNumber"]')
                .text()
                .trim();

            if (!permitNumber) {
                return; // Skip if no permit number found
            }

            // Extract description
            const description = $row
                .find('span[id*="lblDescription"]')
                .text()
                .trim();

            // Extract permit type
            const permitType = $row.find('span[id*="lblType"]').text().trim();

            // Extract address
            const address = $row.find('span[id*="lblAddress"]').text().trim();

            // Parse address components
            let streetAddress = "";
            let city = "Los Gatos";
            let state = "CA";
            let zipCode = "";

            if (address) {
                // Address is in format: "123 STREET NAME, LOS GATOS CA 95032"
                const parts = address.split(",").map((p) => p.trim());
                if (parts.length >= 2) {
                    streetAddress = parts[0];
                    const cityStateZip = parts[parts.length - 1]; // "LOS GATOS CA 95032"
                    const cityStateZipMatch = cityStateZip.match(
                        /^([A-Z ]+) ([A-Z]{2}) (\d{5})$/
                    );
                    if (cityStateZipMatch) {
                        city = cityStateZipMatch[1].trim();
                        state = cityStateZipMatch[2].trim();
                        zipCode = cityStateZipMatch[3].trim();
                    }
                }
            }

            // Extract date (last updated)
            const dateStr = $row
                .find('span[id*="lblUpdatedTime"]')
                .text()
                .trim();
            let issuedDate: Date | undefined;
            if (dateStr) {
                issuedDate = new Date(dateStr);
            }

            permits.push({
                permitNumber,
                title: permitType,
                description,
                address: streetAddress,
                city,
                state,
                zipCode,
                permitType,
                sourceUrl: `https://aca-prod.accela.com/TLG/Cap/CapHome.aspx?module=Building&TabName=HOME`,
                issuedDate,
            });
        });

        return permits;
    }

    /**
     * Format date for Accela system
     * Accela typically uses MM/DD/YYYY format
     */
    private formatDateForAccela(date: Date): string {
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const yyyy = String(date.getFullYear());
        return `${mm}/${dd}/${yyyy}`;
    }
}
