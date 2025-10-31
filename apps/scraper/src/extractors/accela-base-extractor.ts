/**
 * Base extractor for Accela Civic Platform sites
 * Contains common functionality shared by all Accela-based permit extractors
 */

import { BaseExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import { normalizeAccelaStatus } from "../utils/accela-status";

export abstract class AccelaBaseExtractor extends BaseExtractor {
    protected browser: Browser | null = null;
    protected page: Page | null = null;

    /**
     * Get the logger prefix for this extractor (used in console.log statements)
     */
    protected abstract getLoggerPrefix(): string;

    /**
     * Get the default city name to use when parsing addresses
     */
    protected abstract getDefaultCity(): string;

    /**
     * Get the screenshot filename prefix (without extension)
     */
    protected abstract getScreenshotPrefix(): string;

    async scrape(scrapeDate?: Date): Promise<ScrapeResult> {
        try {
            console.log(
                `${this.getLoggerPrefix()} Starting scrape for ${this.city}`
            );

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
                `${this.getLoggerPrefix()} Page loaded, looking for date field...`
            );

            // Calculate date range
            let startDateStr: string;
            let endDateStr: string;

            if (scrapeDate) {
                // If specific date provided, use that date for both start and end
                startDateStr = this.formatDateForAccela(scrapeDate);
                endDateStr = this.formatDateForAccela(scrapeDate);
                console.log(
                    `${this.getLoggerPrefix()} Searching for permits on ${startDateStr}`
                );
            } else {
                // Default: last 30 days from today
                const today = new Date();
                const thirtyDaysAgo = new Date(today);
                thirtyDaysAgo.setDate(today.getDate() - 30);
                startDateStr = this.formatDateForAccela(thirtyDaysAgo);
                endDateStr = this.formatDateForAccela(today);
                console.log(
                    `${this.getLoggerPrefix()} Searching for permits from ${startDateStr} to ${endDateStr}`
                );
            }

            const startDate = startDateStr;

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
                    `${this.getLoggerPrefix()} Filled start date: ${startDate}`
                );

                // Fill end date
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
                }, endDateStr);

                console.log(
                    `${this.getLoggerPrefix()} Filled end date: ${endDateStr}`
                );
            } else {
                console.log(
                    `${this.getLoggerPrefix()} Could not find date fields`
                );
                await this.page.screenshot({
                    path: `${this.getScreenshotPrefix()}-page.png`,
                    fullPage: true,
                });
            }

            // Try to find and click the search button
            const searchSelectors = [
                "#ctl00_PlaceHolderMain_btnNewSearch", // Standard Accela search button
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
                            `${this.getLoggerPrefix()} Found search button with selector: ${selector}`
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
                    `${this.getLoggerPrefix()} Could not find search button automatically`
                );
            }

            // Wait for results to load
            await new Promise((resolve) => setTimeout(resolve, 5000));

            let permits: PermitData[] = [];
            let currentPage = 1;
            let hasMorePages = true;

            // Handle pagination
            while (hasMorePages && currentPage <= 100) {
                console.log(
                    `${this.getLoggerPrefix()} Scraping page ${currentPage}`
                );

                // Wait for table to load
                try {
                    await this.page.waitForSelector("table tbody tr", {
                        timeout: 10000,
                    });
                } catch {
                    console.log(
                        `${this.getLoggerPrefix()} No results table found`
                    );
                    break;
                }

                // Extract data from current page
                const pageContent = await this.page.content();
                const pagePermits = await this.parsePermitData(pageContent);
                console.log(
                    `${this.getLoggerPrefix()} Found ${pagePermits.length} permits on page ${currentPage}`
                );

                permits = permits.concat(pagePermits);

                // Take screenshot of first page
                if (currentPage === 1) {
                    await this.page.screenshot({
                        path: `${this.getScreenshotPrefix()}-results.png`,
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
                `${this.getLoggerPrefix()} Total: ${permits.length} permits from ${currentPage} pages`
            );

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error) {
            console.error(`${this.getLoggerPrefix()} Error:`, error);
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

    protected async parsePermitData(rawData: any): Promise<PermitData[]> {
        const permits: PermitData[] = [];
        const $ = cheerio.load(rawData);

        // First pass: extract basic info from table
        const basicPermits: any[] = [];

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
            let city = this.getDefaultCity();
            let state = "CA";
            let zipCode = "";

            if (address) {
                // Address is in format: "123 STREET NAME, CITY NAME CA 95032"
                const parts = address.split(",").map((p) => p.trim());
                if (parts.length >= 2) {
                    streetAddress = parts[0];
                    const cityStateZip = parts[parts.length - 1]; // "CITY NAME CA 95032"
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

            // Extract status from list column
            const rawStatus = $row.find('span[id*="lblStatus"]').text().trim();
            const status = normalizeAccelaStatus(rawStatus);

            // Extract date (last updated)
            const dateStr = $row
                .find('span[id*="lblUpdatedTime"]')
                .text()
                .trim();
            let issuedDate: Date | undefined;
            let issuedDateString: string | undefined;
            if (dateStr) {
                issuedDateString = dateStr; // Store original format
                // Parse MM/DD/YYYY format and create UTC date
                const [month, day, year] = dateStr.split("/");
                if (month && day && year) {
                    // Create date in UTC to avoid timezone issues
                    issuedDate = new Date(
                        Date.UTC(
                            parseInt(year),
                            parseInt(month) - 1,
                            parseInt(day)
                        )
                    );
                }
            }

            basicPermits.push({
                permitNumber,
                title: permitType,
                description,
                address: streetAddress,
                city,
                state,
                zipCode,
                permitType,
                sourceUrl: this.url,
                issuedDate,
                issuedDateString,
                status: status,
            });
        });

        // Second pass: extract additional details for each permit
        console.log(
            `${this.getLoggerPrefix()} Extracting details for ${basicPermits.length} permits...`
        );
        for (const permit of basicPermits) {
            console.log(
                `${this.getLoggerPrefix()} Extracting details for permit: ${permit.permitNumber}`
            );
            const details = await this.extractPermitDetails(
                permit.permitNumber
            );
            console.log(`${this.getLoggerPrefix()} Found details:`, details);
            permits.push({
                ...permit,
                value: details.jobValue || permit.value,
                licensedProfessionalText: details.licensedProfessional,
            });

            // Add a small delay to avoid overwhelming the server
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        return permits;
    }

    /**
     * Extract additional permit details from detail page
     */
    protected async extractPermitDetails(permitNumber: string): Promise<{
        jobValue?: number;
        licensedProfessional?: string;
    }> {
        if (!this.page) return {};

        try {
            // Find the permit link by searching for the permit number in a link
            const detailLink = await this.page.evaluate((permitNum) => {
                const links = Array.from(
                    (globalThis as any).document.querySelectorAll("a")
                ) as any[];
                const link = links.find(
                    (l: any) =>
                        l.textContent?.includes(permitNum) ||
                        l.getAttribute("href")?.includes(permitNum)
                );
                return link ? link.href : null;
            }, permitNumber);

            if (!detailLink) {
                console.log(
                    `${this.getLoggerPrefix()} No detail link found for ${permitNumber}`
                );
                return {};
            }

            console.log(
                `${this.getLoggerPrefix()} Opening detail page: ${detailLink}`
            );

            // Open detail page in new tab
            const newPage = await this.browser!.newPage();
            await newPage.goto(detailLink, {
                waitUntil: "networkidle2",
                timeout: 30000,
            });

            // Wait for page to load
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Expand "More Details" section if collapsed
            await newPage.evaluate(() => {
                const moreDetailsLink = (
                    globalThis as any
                ).document.querySelector("#lnkMoreDetail");
                const moreDetailsRow = (
                    globalThis as any
                ).document.querySelector("#TRMoreDetail");
                if (moreDetailsRow && moreDetailsRow.style.display === "none") {
                    moreDetailsLink?.click();
                }
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Expand "Additional Information" section if collapsed
            await newPage.evaluate(() => {
                const additionalLink = (
                    globalThis as any
                ).document.querySelector("#lnkAddtional");
                const additionalRow = (
                    globalThis as any
                ).document.querySelector("#trADIList");
                if (additionalRow && additionalRow.style.display === "none") {
                    additionalLink?.click();
                }
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Expand "Application Information" section if collapsed
            await newPage.evaluate(() => {
                const applicationLink = (
                    globalThis as any
                ).document.querySelector("#lnkASI");
                const applicationRow = (
                    globalThis as any
                ).document.querySelector("#trASIList");
                if (applicationRow && applicationRow.style.display === "none") {
                    applicationLink?.click();
                }
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Extract job value and licensed professional (text + raw HTML block)
            const details = await newPage.evaluate(() => {
                const result: {
                    jobValue?: number;
                    licensedProfessional?: string;
                } = {};

                // Extract job value - look for "Job Value($)", "Estimated value of work", or "Valuation"
                const allText =
                    (globalThis as any).document.body.innerText || "";

                // Try different patterns - need to handle "$24,000.00" format
                // First, try to find any dollar amount after "Job Value"
                let jobValueMatch = allText.match(
                    /Job Value.*?\$\s*([\d,]+\.?\d*)/i
                );

                // Also look for dollar signs with commas like "$24,000.00" - try broader search
                if (!jobValueMatch) {
                    // Try broader pattern: look for any number after "Job Value"
                    const match = allText.match(
                        /Job Value\(?\$?\)?:?\s*\$?\s*([\d,]+\.?\d*)/i
                    );
                    if (match && match[1]) {
                        const value = match[1].replace(/,/g, "");
                        result.jobValue = parseFloat(value);
                    } else {
                        // Try finding number with comma pattern like "24,000.00"
                        const numberMatch = allText.match(
                            /Job Value.*?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i
                        );
                        if (numberMatch && numberMatch[1]) {
                            const value = numberMatch[1].replace(/,/g, "");
                            result.jobValue = parseFloat(value);
                        }
                    }
                }

                if (!jobValueMatch && !result.jobValue) {
                    jobValueMatch = allText.match(
                        /Estimated value of work.*?:\s*([\d,]+\.?\d*)/i
                    );
                }

                if (!jobValueMatch && !result.jobValue) {
                    jobValueMatch = allText.match(
                        /Valuation.*?:\s*([\d,]+\.?\d*)/i
                    );
                }

                if (jobValueMatch && jobValueMatch[1] && !result.jobValue) {
                    const value = jobValueMatch[1].replace(/,/g, "");
                    result.jobValue = parseFloat(value);
                }

                // Extract licensed professional - prefer DOM selection
                try {
                    const header = (globalThis as any).document.querySelector(
                        'span[id*="permitDetail_label_license"]'
                    );
                    const table = (globalThis as any).document.querySelector(
                        "#tbl_licensedps"
                    );
                    if (table) {
                        // Best-effort text extract from the table
                        const text = (table as any).innerText
                            .replace(/\s+/g, " ")
                            .trim();
                        if (text) {
                            result.licensedProfessional = text;
                        }
                    } else {
                        // Fallback to regex on page text
                        const licensedMatch = allText.match(
                            /Licensed Professional:.*?\n([^\n]+)/i
                        );
                        if (licensedMatch && licensedMatch[1]) {
                            result.licensedProfessional =
                                licensedMatch[1].trim();
                        }
                    }
                } catch {}

                return result;
            });

            await newPage.close();
            return details;
        } catch (error) {
            console.error(
                `Error extracting details for ${permitNumber}:`,
                error
            );
            return {};
        }
    }

    /**
     * Format date for Accela system
     * Accela typically uses MM/DD/YYYY format
     */
    protected formatDateForAccela(date: Date): string {
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const yyyy = String(date.getFullYear());
        return `${mm}/${dd}/${yyyy}`;
    }
}
