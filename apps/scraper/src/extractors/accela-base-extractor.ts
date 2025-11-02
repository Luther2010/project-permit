/**
 * Base extractor for Accela Civic Platform sites
 * Contains common functionality shared by all Accela-based permit extractors
 */

import { BaseDailyExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import { normalizeAccelaStatus } from "../utils/accela-status";

export abstract class AccelaBaseExtractor extends BaseDailyExtractor {
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

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
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
                const pagePermits = await this.parsePermitData(pageContent, limit);
                console.log(
                    `${this.getLoggerPrefix()} Found ${pagePermits.length} permits on page ${currentPage}`
                );

                permits = permits.concat(pagePermits);
                
                // Stop if we've reached the limit
                if (limit && permits.length >= limit) {
                    permits = permits.slice(0, limit);
                    break;
                }

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

    protected async parsePermitData(rawData: any, limit?: number): Promise<PermitData[]> {
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

            // Extract address - get full text from the address cell (may include city/state/zip)
            // Try to get the full cell content, not just the span text
            const addressSpan = $row.find('span[id*="lblAddress"]');
            let address = addressSpan.text().trim();
            
            // If address doesn't have a comma or zip code, try getting the full cell text
            if (address && !address.includes(',') && !address.match(/\b\d{5}(?:-\d{4})?\b/)) {
                const addressCell = addressSpan.closest('td');
                if (addressCell.length) {
                    const cellText = addressCell.text().trim();
                    // Use cell text if it has more complete information (comma + zip pattern)
                    if (cellText.includes(',') && cellText.match(/\b\d{5}(?:-\d{4})?\b/)) {
                        address = cellText;
                    }
                }
            }

            // Parse address components
            let streetAddress = "";
            let city = this.getDefaultCity();
            let state = "CA";
            let zipCode = "";

            if (address) {
                // Address formats:
                // 1. "957 S TANTAU Ave, Cupertino CA 95014-4601" (mixed case city)
                // 2. "16619 MARCHMONT DR, LOS GATOS CA 95032" (all uppercase city)
                // 3. "3079 EL CAMINO REAL, 101, SANTA CLARA CA 95051" (with unit number)
                // Parse the full address structure
                const parts = address.split(",").map((p) => p.trim());
                if (parts.length >= 2) {
                    // Has comma - format could be:
                    // "STREET, CITY STATE ZIP" 
                    // "STREET, UNIT, CITY STATE ZIP"
                    streetAddress = parts[0];
                    
                    // Last part should be "CITY STATE ZIP" - could be uppercase or mixed case
                    const cityStateZip = parts[parts.length - 1]; // "LOS GATOS CA 95032" or "Cupertino CA 95014-4601"
                    
                    // Match: city name (uppercase words or mixed case), state (2 letters), zip (5 digits optionally with -4 more digits)
                    // Handles both "LOS GATOS CA 95032" and "Cupertino CA 95014-4601"
                    const cityStateZipMatch = cityStateZip.match(
                        /^([A-Z][A-Z\s]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
                    );
                    if (cityStateZipMatch) {
                        city = cityStateZipMatch[1].trim();
                        state = cityStateZipMatch[2].trim();
                        // Extract zip code - take first 5 digits (before hyphen if present)
                        zipCode = cityStateZipMatch[3].split('-')[0]; // Extract "95032" from "95032" or "95014" from "95014-4601"
                    }
                    
                    // Handle unit numbers (e.g., "3079 EL CAMINO REAL, 101, SANTA CLARA CA 95051")
                    if (parts.length >= 3 && parts[1].match(/^\d+$/)) {
                        // Middle part is a unit number - include it in street address
                        streetAddress = `${parts[0]}, ${parts[1]}`;
                    }
                } else {
                    // No comma - just street address or "STREET CITY STATE ZIP" format
                    streetAddress = address;
                    // Try to extract zip if it appears after state abbreviation
                    const zipAfterState = address.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
                    if (zipAfterState) {
                        state = zipAfterState[1];
                        zipCode = zipAfterState[2].split('-')[0];
                        // Remove state and zip from street address
                        streetAddress = address.substring(0, address.indexOf(zipAfterState[0])).trim();
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
            let appliedDate: Date | undefined;
            let appliedDateString: string | undefined;
            if (dateStr) {
                appliedDateString = dateStr; // Store original format
                // Parse MM/DD/YYYY format and create UTC date
                const [month, day, year] = dateStr.split("/");
                if (month && day && year) {
                    // Create date in UTC to avoid timezone issues
                    appliedDate = new Date(
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
                appliedDate,
                appliedDateString,
                status: status,
            });
        });

        // Second pass: extract additional details for each permit
        // Apply limit if specified (for testing)
        const permitsToProcess = limit ? basicPermits.slice(0, limit) : basicPermits;
        console.log(
            `${this.getLoggerPrefix()} Extracting details for ${permitsToProcess.length} permits${limit ? ` (limited from ${basicPermits.length})` : ""}...`
        );
        for (const permit of permitsToProcess) {
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

            // Extract job value and licensed professional
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
