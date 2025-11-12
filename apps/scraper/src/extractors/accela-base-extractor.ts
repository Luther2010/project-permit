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

    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
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

            if (startDate && endDate) {
                // Use provided date range
                startDateStr = this.formatDateForAccela(startDate);
                endDateStr = this.formatDateForAccela(endDate);
                console.log(
                    `${this.getLoggerPrefix()} Searching for permits from ${startDateStr} to ${endDateStr}`
                );
            } else if (startDate) {
                // Only start date provided - use startDate to today
                startDateStr = this.formatDateForAccela(startDate);
                endDateStr = this.formatDateForAccela(new Date());
                console.log(
                    `${this.getLoggerPrefix()} Searching for permits from ${startDateStr} to ${endDateStr}`
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
            }, startDateStr);

            if (startDateValue) {
                console.log(
                    `${this.getLoggerPrefix()} Filled start date: ${startDateStr}`
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

            // Check if we're on a detail page (single result redirect)
            // Accela redirects directly to detail page when there's only one search result
            const isDetailPage = await this.page.evaluate(() => {
                const url = (globalThis as any).window.location.href;
                
                // Check URL first - if it contains CapDetail.aspx, it's likely a detail page
                const isDetailUrl = url.includes('CapDetail.aspx');
                
                // Check for results table rows
                const allRows = (globalThis as any).document.querySelectorAll('tr.ACA_TabRow_Odd, tr.ACA_TabRow_Even');
                const hasResultsTable = allRows.length > 0;
                
                // Check for pagination (indicates multiple results)
                const pagination = (globalThis as any).document.querySelector('.aca_pagination, .ACA_Table_Pages');
                const hasPagination = !!pagination;
                
                // Check for detail page elements
                const hasMoreDetailLink = !!(globalThis as any).document.querySelector('#lnkMoreDetail');
                const hasAdditionalInfo = !!(globalThis as any).document.querySelector('#trADIList');
                const hasDetailPageElements = hasMoreDetailLink || hasAdditionalInfo;
                
                // Decision logic:
                // 1. If URL is CapDetail.aspx AND we have detail page elements, it's definitely a detail page
                if (isDetailUrl && hasDetailPageElements) {
                    return true;
                }
                
                // 2. If URL is CapDetail.aspx AND no results table, it's a detail page
                if (isDetailUrl && !hasResultsTable) {
                    return true;
                }
                
                // 3. If we have a results table with multiple rows OR pagination, it's NOT a detail page
                if (hasResultsTable && (allRows.length > 1 || hasPagination)) {
                    return false;
                }
                
                // 4. If we have exactly one row in results table but no pagination and URL is CapDetail.aspx,
                // it might be a detail page (single result shown in table format)
                if (hasResultsTable && allRows.length === 1 && !hasPagination && isDetailUrl) {
                    return true;
                }
                
                // 5. If we have detail page elements and no results table, it's a detail page
                if (hasDetailPageElements && !hasResultsTable) {
                    return true;
                }
                
                // Default: not a detail page
                return false;
            });

            if (isDetailPage) {
                console.log(
                    `${this.getLoggerPrefix()} Single result detected - on detail page, extracting directly...`
                );
                
                // Extract permit data from detail page using shared method
                const permit = await this.extractPermitFromDetailPage(this.page);
                if (permit) {
                    permits.push(permit);
                    console.log(
                        `${this.getLoggerPrefix()} Extracted permit from detail page: ${permit.permitNumber}`
                    );
                }
            } else {
                // Multiple results - proceed with table extraction
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
            }

            console.log(
                `${this.getLoggerPrefix()} Total: ${permits.length} permits`
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

    /**
     * Extract permits from the current page
     * Handles both single result (detail page) and multiple results (table) cases
     */
    protected async extractPermitsFromPage(limit?: number): Promise<PermitData[]> {
        let permits: PermitData[] = [];

        // Check if we're on a detail page (single result redirect)
        // Accela redirects directly to detail page when there's only one search result
        const isDetailPage = await this.page!.evaluate(() => {
            const url = (globalThis as any).window.location.href;
            
            // Check URL first - if it contains CapDetail.aspx, it's likely a detail page
            const isDetailUrl = url.includes('CapDetail.aspx');
            
            // Check for results table rows
            const allRows = (globalThis as any).document.querySelectorAll('tr.ACA_TabRow_Odd, tr.ACA_TabRow_Even');
            const hasResultsTable = allRows.length > 0;
            
            // Check for pagination (indicates multiple results)
            const pagination = (globalThis as any).document.querySelector('.aca_pagination, .ACA_Table_Pages');
            const hasPagination = !!pagination;
            
            // Check for detail page elements
            const hasMoreDetailLink = !!(globalThis as any).document.querySelector('#lnkMoreDetail');
            const hasAdditionalInfo = !!(globalThis as any).document.querySelector('#trADIList');
            const hasPermitNumberSpan = !!(globalThis as any).document.querySelector('span[id*="lblPermitNumber"]');
            const hasDetailPageElements = hasMoreDetailLink || hasAdditionalInfo || hasPermitNumberSpan;
            
            // Decision logic:
            // 1. If URL is CapDetail.aspx AND we have detail page elements, it's definitely a detail page
            if (isDetailUrl && hasDetailPageElements) {
                return true;
            }
            
            // 2. If URL is CapDetail.aspx AND no results table, it's a detail page
            if (isDetailUrl && !hasResultsTable) {
                return true;
            }
            
            // 2b. If URL is CapDetail.aspx AND we have permit number span, it's a detail page
            if (isDetailUrl && hasPermitNumberSpan) {
                return true;
            }
            
            // 3. If we have a results table with multiple rows OR pagination, it's NOT a detail page
            if (hasResultsTable && (allRows.length > 1 || hasPagination)) {
                return false;
            }
            
            // 4. If we have exactly one row in results table but no pagination and URL is CapDetail.aspx,
            // it might be a detail page (single result shown in table format)
            if (hasResultsTable && allRows.length === 1 && !hasPagination && isDetailUrl) {
                return true;
            }
            
            // 5. If we have detail page elements and no results table, it's a detail page
            if (hasDetailPageElements && !hasResultsTable) {
                return true;
            }
            
            // Default: not a detail page
            return false;
        });

        if (isDetailPage) {
            console.log(
                `${this.getLoggerPrefix()} Single result detected - on detail page, extracting directly...`
            );
            
            // Extract permit data from detail page using shared method
            const permit = await this.extractPermitFromDetailPage(this.page!);
            if (permit) {
                permits.push(permit);
                console.log(
                    `${this.getLoggerPrefix()} Extracted permit from detail page: ${permit.permitNumber}`
                );
            }
        } else {
            // Multiple results - proceed with table extraction
            let currentPage = 1;
            let hasMorePages = true;

            // Handle pagination
            while (hasMorePages && currentPage <= 100) {
                console.log(
                    `${this.getLoggerPrefix()} Scraping page ${currentPage}`
                );

                // Wait for table to load
                try {
                    await this.page!.waitForSelector("table tbody tr", {
                        timeout: 10000,
                    });
                } catch {
                    console.log(
                        `${this.getLoggerPrefix()} No results table found`
                    );
                    break;
                }

                // Extract data from current page
                const pageContent = await this.page!.content();
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


                // Check for next page button
                hasMorePages = await this.page!.evaluate(() => {
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
        }

        return permits;
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

            // Parse address components using shared method
            const { streetAddress, city, state, zipCode } = this.parseAddress(address);

            // Extract status from list column
            const rawStatus = $row.find('span[id*="lblStatus"]').text().trim();
            const status = normalizeAccelaStatus(rawStatus);

            // Extract date (last updated) using shared method
            const dateStr = $row
                .find('span[id*="lblUpdatedTime"]')
                .text()
                .trim();
            const { appliedDate, appliedDateString } = this.parseDateFromString(dateStr);

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

            // Expand sections and extract details using shared methods
            await this.expandDetailPageSections(newPage);
            const details = await this.extractDetailPageData(newPage);

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

    /**
     * Parse address string into components
     * Handles formats like:
     * - "957 S TANTAU Ave, Cupertino CA 95014-4601"
     * - "16619 MARCHMONT DR, LOS GATOS CA 95032"
     * - "3079 EL CAMINO REAL, 101, SANTA CLARA CA 95051"
     */
    protected parseAddress(address: string): {
        streetAddress: string;
        city: string;
        state: string;
        zipCode: string;
    } {
        let streetAddress = "";
        let city = this.getDefaultCity();
        let state = "CA";
        let zipCode = "";

        if (address) {
            const parts = address.split(",").map((p) => p.trim());
            if (parts.length >= 2) {
                streetAddress = parts[0];
                const cityStateZip = parts[parts.length - 1];
                const cityStateZipMatch = cityStateZip.match(
                    /^([A-Z][A-Z\s]+|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
                );
                if (cityStateZipMatch) {
                    city = cityStateZipMatch[1].trim();
                    state = cityStateZipMatch[2].trim();
                    zipCode = cityStateZipMatch[3].split('-')[0];
                }
                if (parts.length >= 3 && parts[1].match(/^\d+$/)) {
                    streetAddress = `${parts[0]}, ${parts[1]}`;
                }
            } else {
                streetAddress = address;
                const zipAfterState = address.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
                if (zipAfterState) {
                    state = zipAfterState[1];
                    zipCode = zipAfterState[2].split('-')[0];
                    streetAddress = address.substring(0, address.indexOf(zipAfterState[0])).trim();
                }
            }
        }

        return { streetAddress, city, state, zipCode };
    }

    /**
     * Parse date string (MM/DD/YYYY format) into Date object
     */
    protected parseDateFromString(dateStr: string): {
        appliedDate?: Date;
        appliedDateString?: string;
    } {
        if (!dateStr) {
            return {};
        }

        const [month, day, year] = dateStr.split("/");
        if (month && day && year) {
            return {
                appliedDate: new Date(
                    Date.UTC(
                        parseInt(year),
                        parseInt(month) - 1,
                        parseInt(day)
                    )
                ),
                appliedDateString: dateStr,
            };
        }
        return { appliedDateString: dateStr };
    }

    /**
     * Expand collapsed sections on a detail page
     */
    protected async expandDetailPageSections(page: Page): Promise<void> {
            // Expand "More Details" section if collapsed
        await page.evaluate(() => {
            const moreDetailsLink = (globalThis as any).document.querySelector("#lnkMoreDetail");
            const moreDetailsRow = (globalThis as any).document.querySelector("#TRMoreDetail");
                if (moreDetailsRow && moreDetailsRow.style.display === "none") {
                    moreDetailsLink?.click();
                }
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Expand "Additional Information" section if collapsed
        await page.evaluate(() => {
            const additionalLink = (globalThis as any).document.querySelector("#lnkAddtional");
            const additionalRow = (globalThis as any).document.querySelector("#trADIList");
                if (additionalRow && additionalRow.style.display === "none") {
                    additionalLink?.click();
                }
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Expand "Application Information" section if collapsed
        await page.evaluate(() => {
            const applicationLink = (globalThis as any).document.querySelector("#lnkASI");
            const applicationRow = (globalThis as any).document.querySelector("#trASIList");
                if (applicationRow && applicationRow.style.display === "none") {
                    applicationLink?.click();
                }
            });
            await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    /**
     * Extract job value and licensed professional from a detail page
     */
    protected async extractDetailPageData(page: Page): Promise<{
        jobValue?: number;
        licensedProfessional?: string;
    }> {
        return await page.evaluate(() => {
                const result: {
                    jobValue?: number;
                    licensedProfessional?: string;
                } = {};

            const allText = (globalThis as any).document.body.innerText || "";
            
            // Extract job value
            let jobValueMatch = allText.match(/Job Value.*?\$\s*([\d,]+\.?\d*)/i);
                if (!jobValueMatch) {
                const match = allText.match(/Job Value\(?\$?\)?:?\s*\$?\s*([\d,]+\.?\d*)/i);
                    if (match && match[1]) {
                        const value = match[1].replace(/,/g, "");
                        result.jobValue = parseFloat(value);
                    } else {
                    const numberMatch = allText.match(/Job Value.*?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
                        if (numberMatch && numberMatch[1]) {
                            const value = numberMatch[1].replace(/,/g, "");
                            result.jobValue = parseFloat(value);
                        }
                    }
                }

                if (!jobValueMatch && !result.jobValue) {
                jobValueMatch = allText.match(/Estimated value of work.*?:\s*([\d,]+\.?\d*)/i);
                }

                if (!jobValueMatch && !result.jobValue) {
                jobValueMatch = allText.match(/Valuation.*?:\s*([\d,]+\.?\d*)/i);
                }

                if (jobValueMatch && jobValueMatch[1] && !result.jobValue) {
                    const value = jobValueMatch[1].replace(/,/g, "");
                    result.jobValue = parseFloat(value);
                }

            // Extract licensed professional
            try {
                const header = (globalThis as any).document.querySelector('span[id*="permitDetail_label_license"]');
                const table = (globalThis as any).document.querySelector("#tbl_licensedps");
                    if (table) {
                    const text = (table as any).innerText.replace(/\s+/g, " ").trim();
                        if (text) {
                            result.licensedProfessional = text;
                        }
                    } else {
                    const licensedMatch = allText.match(/Licensed Professional:.*?\n([^\n]+)/i);
                        if (licensedMatch && licensedMatch[1]) {
                        result.licensedProfessional = licensedMatch[1].trim();
                        }
                    }
                } catch {}

                return result;
            });
    }

    /**
     * Extract full permit data from a detail page
     * This is the single source of truth for detail page extraction
     */
    protected async extractPermitFromDetailPage(page: Page): Promise<PermitData | null> {
        // Expand sections first
        await this.expandDetailPageSections(page);

        // Wait a bit for page to fully render
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get page content
        const pageContent = await page.content();
        const $ = cheerio.load(pageContent);
        
        // Extract permit number - try multiple selectors
        let permitNumber = $('span[id*="lblPermitNumber"]').first().text().trim();
        if (!permitNumber) {
            // Try alternative selector (without wildcard)
            permitNumber = $('#ctl00_PlaceHolderMain_lblPermitNumber').text().trim();
        }
        if (!permitNumber) {
            // Try finding it in the h1 heading
            permitNumber = $('h1 span[id*="PermitNumber"]').first().text().trim();
        }
        
        if (!permitNumber) {
            console.log(
                `${this.getLoggerPrefix()} Could not find permit number on detail page`
            );
            // Debug: log what we can find
            const allSpans = $('span').map((i, el) => $(el).attr('id')).get();
            console.log(
                `${this.getLoggerPrefix()} Available span IDs: ${allSpans.filter(id => id && id.includes('Permit')).join(', ')}`
            );
            return null;
        }
        
        // Extract basic info
        const description = $('span[id*="lblDescription"]').first().text().trim();
        const permitType = $('span[id*="lblType"]').first().text().trim();
        
        // Extract address
        const addressSpan = $('span[id*="lblAddress"]').first();
        let address = addressSpan.text().trim();
        if (!address) {
            const addressCell = addressSpan.closest('td');
            if (addressCell.length) {
                address = addressCell.text().trim();
            }
        }
        
        // Parse address
        const { streetAddress, city, state, zipCode } = this.parseAddress(address);
        
        // Extract status
        const rawStatus = $('span[id*="lblStatus"]').first().text().trim();
        const status = normalizeAccelaStatus(rawStatus);
        
        // Extract date
        const dateStr = $('span[id*="lblUpdatedTime"]').first().text().trim();
        const { appliedDate, appliedDateString } = this.parseDateFromString(dateStr);
        
        // Extract additional details (job value, licensed professional)
        const details = await this.extractDetailPageData(page);
        
        return {
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
            value: details.jobValue,
            licensedProfessionalText: details.licensedProfessional,
        };
    }

    /**
     * Scrape permits by contractor license number
     * This method searches for permits associated with a specific contractor license
     * and extracts contractor information that's not available in date-based searches
     * 
     * @param contractorLicense - Contractor license number to search for
     * @param startDate - Optional start date for permit search
     * @param endDate - Optional end date for permit search
     * @param limit - Optional limit on number of permits to return
     * @returns ScrapeResult with permits found for this contractor
     */
    async scrapeByContractorLicense(
        contractorLicense: string,
        startDate?: Date,
        endDate?: Date,
        limit?: number
    ): Promise<ScrapeResult> {
        try {
            console.log(
                `${this.getLoggerPrefix()} Starting contractor license search for: ${contractorLicense}`
            );

            // Launch browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Navigate to the permit search page
            await this.page.goto(this.url, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            console.log(
                `${this.getLoggerPrefix()} Page loaded, looking for contractor license field...`
            );

            // Wait for the page to be interactive
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Fill date fields if provided
            if (startDate && endDate) {
                const startDateStr = this.formatDateForAccela(startDate);
                const endDateStr = this.formatDateForAccela(endDate);
                
                console.log(
                    `${this.getLoggerPrefix()} Setting date range: ${startDateStr} to ${endDateStr}`
                );

                // Fill start date field
                const startDateFilled = await this.page.evaluate((date) => {
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
                }, startDateStr);

                if (startDateFilled) {
                    console.log(
                        `${this.getLoggerPrefix()} Filled start date: ${startDateStr}`
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
                        `${this.getLoggerPrefix()} Could not find date fields, continuing without date filter`
                    );
                }
            }

            // Find and fill the contractor license field
            // Accela portals (Cupertino and Palo Alto) use a specific ID for the license number field
            const licenseFieldFilled = await this.page.evaluate((license) => {
                const selector = '#ctl00_PlaceHolderMain_generalSearchForm_txtGSLicenseNumber';
                const input = (globalThis as any).document.querySelector(selector) as any;
                if (input) {
                    input.value = license;
                    input.dispatchEvent(
                        new Event("input", { bubbles: true })
                    );
                    input.dispatchEvent(
                        new Event("change", { bubbles: true })
                    );
                    return true;
                }
                return false;
            }, contractorLicense);

            if (!licenseFieldFilled) {
                throw new Error("Could not find contractor license search field");
            }

            console.log(
                `${this.getLoggerPrefix()} Filled contractor license: ${contractorLicense}`
            );

            // Click search button (same logic as date-based search)
            const searchSelectors = [
                "#ctl00_PlaceHolderMain_btnNewSearch",
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
                throw new Error("Could not find search button");
            }

            // Wait for results to load
            await new Promise((resolve) => setTimeout(resolve, 5000));

            // Extract permits (handles both single result detail page and multiple results table)
            const permits = await this.extractPermitsFromPage(limit);
            
            // Debug: if no permits found, log page info
            if (permits.length === 0) {
                const currentUrl = await this.page.url();
                const pageTitle = await this.page.title();
                console.log(
                    `${this.getLoggerPrefix()} No permits found. Current URL: ${currentUrl}, Page title: ${pageTitle}`
                );
            }

            console.log(
                `${this.getLoggerPrefix()} Total: ${permits.length} permits found for contractor ${contractorLicense}`
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
}
