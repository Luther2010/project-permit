/**
 * Energov Base Extractor
 * Base class for scrapers that interact with Tyler Technologies Energov/SelfService portal
 * Used by cities like Sunnyvale, Gilroy, etc.
 */

import { BaseDailyExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";

export abstract class EnergovBaseExtractor extends BaseDailyExtractor {
    protected browser: Browser | null = null;
    protected page: Page | null = null;

    /**
     * Get the base URL for this Energov instance (e.g., "https://sunnyvaleca-energovpub.tylerhost.net")
     */
    protected abstract getBaseUrl(): string;

    /**
     * Whether to extract contractor license info from the "More Info" tab
     * Some cities (like Sunnyvale) don't allow anonymous users to access this tab
     * Defaults to true for backward compatibility
     */
    protected shouldExtractContractorInfo(): boolean {
        return true;
    }

    /**
     * Whether to extract detail page data (valuation, contractor license)
     * Can be overridden by subclasses to disable detail page extraction
     * Defaults to true for backward compatibility
     */
    protected shouldExtractDetailPageData(): boolean {
        return true;
    }

    /**
     * Default scrape implementation for Energov-based extractors
     * Can be overridden by subclasses if needed
     */
    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
        const extractorName = this.getName();
        const dateRange = startDate && endDate
            ? `${this.formatDate(startDate)} to ${this.formatDate(endDate)}`
            : startDate
                ? `from ${this.formatDate(startDate)}`
                : "today";
        
        console.log(`[${extractorName}] Starting scrape for ${this.city} (${dateRange})${limit ? ` [limit: ${limit}]` : ""}`);

        try {
            // Launch browser
            console.log(`[${extractorName}] Launching browser...`);
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Navigate to search page
            console.log(`[${extractorName}] Navigating to search page...`);
            await this.page.goto(this.url, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            // Calculate dates to search
            let startDateStr: string;
            let endDateStr: string | undefined;
            if (startDate && endDate) {
                startDateStr = this.formatDate(startDate);
                endDateStr = this.formatDate(endDate);
            } else if (startDate) {
                startDateStr = this.formatDate(startDate);
                endDateStr = undefined; // Don't set end date filter if not provided
            } else {
                // No date provided - use today
                const today = new Date();
                startDateStr = this.formatDate(today);
                endDateStr = this.formatDate(today);
            }

            // Set up search filters
            console.log(`[${extractorName}] Setting up search filters (${startDateStr}${endDateStr ? ` to ${endDateStr}` : ""})...`);
            await this.setupSearchFilters(this.page, startDateStr, endDateStr);

            // Perform search
            console.log(`[${extractorName}] Performing search...`);
            await this.performSearch(this.page);

            // Set page size to 100 to get all permits on one page (avoids pagination issues)
            console.log(`[${extractorName}] Setting page size to 100...`);
            await this.setPageSize(this.page, 100);

            // Parse permits from all pages
            console.log(`[${extractorName}] Extracting permits from search results...`);
            const permits = await this.navigatePages(this.page, limit);
            
            console.log(`[${extractorName}] ✅ Scrape completed: ${permits.length} permit(s) extracted`);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            const extractorName = this.getName();
            console.error(`[${extractorName}] ❌ Scrape failed: ${error.message}`);
            if (error.stack) {
                console.error(`[${extractorName}] Stack trace:`, error.stack);
            }
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

    /**
     * Normalize Energov/Tyler status text to our PermitStatus enum
     * Can be overridden by subclasses for city-specific mappings
     */
    protected normalizeStatus(raw?: string): string {
        if (!raw) return "UNKNOWN";
        const s = raw.trim().toLowerCase();

        // ISSUED states - permits that are active and issued/completed
        if (
            s === "active - issued" ||
            s === "approved" ||
            s === "finaled" ||
            (s.includes("final") && !s.includes("pending"))
        ) {
            return "ISSUED";
        }

        // IN_REVIEW states - permits that are being processed
        if (
            s === "active - pending review" ||
            s === "active - returned to applicant" ||
            s === "submitted" ||
            s === "submitted - online" ||
            s === "incomplete" ||
            s.includes("pending") ||
            s.includes("review") ||
            (s.includes("returned") && s.includes("applicant"))
        ) {
            return "IN_REVIEW";
        }

        // INACTIVE states - permits that are cancelled, voided, or expired
        if (
            s === "void" ||
            s === "cancelled" ||
            s === "canceled" ||
            s.includes("expired") ||
            s.includes("revoked") ||
            s.includes("withdrawn") ||
            s.includes("closed")
        ) {
            return "INACTIVE";
        }

        // Default fallback: check if it contains common keywords
        if (s.includes("active")) {
            // If it's "active" but doesn't match specific patterns above, default to IN_REVIEW
            return "IN_REVIEW";
        }

        return "UNKNOWN";
    }

    /**
     * Parse date string (MM/DD/YYYY format) to Date object
     */
    protected parseDate(dateStr: string): Date | undefined {
        if (!dateStr || !dateStr.trim()) return undefined;

        const parts = dateStr.trim().split("/");
        if (parts.length !== 3) return undefined;

        const month = parseInt(parts[0], 10) - 1; // Month is 0-indexed
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        if (isNaN(month) || isNaN(day) || isNaN(year)) return undefined;

        return new Date(year, month, day);
    }

    /**
     * Extract address and parse zip code
     */
    protected parseAddress(addressStr: string): { address: string; zipCode?: string } {
        if (!addressStr) return { address: addressStr || "" };

        // Common pattern: "STREET CITY STATE ZIP"
        // Example: "1067 PAINTBRUSH DR SUNNYVALE CA 94086"
        const zipMatch = addressStr.match(/\b(\d{5})\b(?:\s*$)/);
        const zipCode = zipMatch ? zipMatch[1] : undefined;

        return {
            address: addressStr.trim(),
            zipCode,
        };
    }

    /**
     * Wait for AngularJS to finish loading and rendering
     */
    protected async waitForAngular(page: Page): Promise<void> {
        try {
            await page.waitForFunction(
                () => {
                    const win = globalThis as any;
                    const doc = (globalThis as any).document;
                    return (
                        win.angular !== undefined &&
                        win.angular.element(doc).injector() !== null &&
                        !win.angular.element(doc).injector().get("$http").pendingRequests.length
                    );
                },
                { timeout: 10000 }
            );
        } catch (e) {
            // If AngularJS detection fails, just wait a bit for page to stabilize
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    /**
     * Set the page size for search results
     * Changes the pageSizeList dropdown to the specified value (e.g., 100)
     */
    protected async setPageSize(page: Page, pageSize: number): Promise<void> {
        const extractorName = this.getName();
        
        try {
            // Wait for the page size dropdown to be available
            await page.waitForSelector('#pageSizeList', { timeout: 10000 });
            
            // Use Puppeteer's select method which properly triggers change events
            try {
                await page.select('#pageSizeList', String(pageSize));
                console.log(`[${extractorName}] Selected page size ${pageSize} using Puppeteer select`);
            } catch (error: any) {
                console.warn(`[${extractorName}] Puppeteer select failed: ${error.message}, trying AngularJS approach...`);
                
                // Fallback: Manual approach with AngularJS
                const changed = await page.evaluate((size) => {
                    const select = (globalThis as any).document.getElementById('pageSizeList') as any;
                    if (!select) {
                        return { success: false, reason: 'Dropdown not found' };
                    }
                    
                    // Check if AngularJS is available
                    const angular = (globalThis as any).window.angular;
                    if (angular) {
                        try {
                            const element = angular.element(select);
                            const scope = element.scope();
                            if (scope) {
                                // Use AngularJS to change the value
                                scope.$apply(() => {
                                    // Update the model value if it exists
                                    if (scope.vm && scope.vm.pageSize !== undefined) {
                                        scope.vm.pageSize = parseInt(String(size), 10);
                                    }
                                    // Also try to find and call a page size change method
                                    if (scope.vm && typeof scope.vm.changePageSize === 'function') {
                                        scope.vm.changePageSize(parseInt(String(size), 10));
                                    } else if (scope.vm && typeof scope.vm.setPageSize === 'function') {
                                        scope.vm.setPageSize(parseInt(String(size), 10));
                                    }
                                    // Set the select value
                                    select.value = String(size);
                                });
                                return { success: true };
                            }
                        } catch (e) {
                            console.error('AngularJS approach failed:', e);
                        }
                    }
                    
                    // Direct DOM manipulation fallback
                    select.value = String(size);
                    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
                    select.dispatchEvent(changeEvent);
                    
                    return { success: true };
                }, pageSize);
                
                if (!changed || !changed.success) {
                    console.warn(`[${extractorName}] Could not change page size: ${changed?.reason || 'Unknown error'}`);
                    return;
                }
            }
            
            // Wait for AngularJS to process the change and reload results
            await this.waitForAngular(page);
            
            // Get initial count before change to compare later
            const initialStatus = await page.evaluate(() => {
                const countSpan = (globalThis as any).document.getElementById('startAndEndCount') as any;
                const permitDivs = (globalThis as any).document.querySelectorAll('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');
                return {
                    countText: countSpan ? countSpan.textContent?.trim() : null,
                    permitCount: permitDivs.length,
                };
            });
            
            // Wait for results to reload - check that count text changed to show all results
            let retries = 0;
            const maxRetries = 10;
            let resultsUpdated = false;
            
            while (retries < maxRetries && !resultsUpdated) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await this.waitForAngular(page);
                
                const status = await page.evaluate((initialCountText, initialPermitCount) => {
                    const countSpan = (globalThis as any).document.getElementById('startAndEndCount') as any;
                    const permitDivs = (globalThis as any).document.querySelectorAll('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');
                    
                    const countText = countSpan ? countSpan.textContent?.trim() : null;
                    const currentPermitCount = permitDivs.length;
                    
                    // Check if results reloaded - count text changed or more permits visible
                    const countChanged = countText !== initialCountText;
                    const morePermitsVisible = currentPermitCount > initialPermitCount;
                    
                    // Parse the count text to see if it shows all results (e.g., "1 - 17 of 17" means all are shown)
                    let showsAllResults = false;
                    if (countText) {
                        // Match pattern like "1 - 17 of 17" or "1 - 100 of 610"
                        const match = countText.match(/(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/);
                        if (match) {
                            const start = parseInt(match[1], 10);
                            const end = parseInt(match[2], 10);
                            const total = parseInt(match[3], 10);
                            // If end equals total, all results are shown
                            showsAllResults = (end === total && start === 1);
                        }
                    }
                    
                    return {
                        countText,
                        currentPermitCount,
                        countChanged,
                        morePermitsVisible,
                        showsAllResults,
                    };
                }, initialStatus.countText, initialStatus.permitCount);
                
                // Results are updated if count text changed or we're showing all results
                if (status.countChanged || status.showsAllResults || status.morePermitsVisible) {
                    resultsUpdated = true;
                    console.log(`[${extractorName}] ✅ Results updated: ${status.countText} (${status.currentPermitCount} permits visible)`);
                } else {
                    retries++;
                    console.log(`[${extractorName}] ⏳ Waiting for results to reload (attempt ${retries}/${maxRetries})... Count: ${status.countText}, Visible: ${status.currentPermitCount}`);
                }
            }
            
            // Final verification
            const finalStatus = await page.evaluate((size) => {
                const select = (globalThis as any).document.getElementById('pageSizeList') as any;
                const countSpan = (globalThis as any).document.getElementById('startAndEndCount') as any;
                const permitDivs = (globalThis as any).document.querySelectorAll('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');
                
                return {
                    selectedValue: select ? select.value : null,
                    countText: countSpan ? countSpan.textContent?.trim() : null,
                    visiblePermits: permitDivs.length,
                };
            }, pageSize);
            
            console.log(`[${extractorName}] ✅ Page size change complete - Selected: ${finalStatus.selectedValue}, Count: ${finalStatus.countText}, Visible permits: ${finalStatus.visiblePermits}`);
            
            if (finalStatus.selectedValue !== String(pageSize)) {
                console.warn(`[${extractorName}] ⚠️  Page size may not have changed correctly. Expected: ${pageSize}, Got: ${finalStatus.selectedValue}`);
            }
        } catch (error: any) {
            console.warn(`[${extractorName}] ⚠️  Failed to set page size to ${pageSize}: ${error.message}`);
            // Don't throw - continue with default page size if this fails
        }
    }

    /**
     * Format date for Energov date inputs (MM/DD/YYYY)
     */
    protected formatDate(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    /**
     * Extract Valuation and Contractor License from permit detail page
     * Opens the detail page in a new tab, extracts the data, then closes the tab
     */
    protected async extractDetailPageData(detailUrl: string): Promise<{ value?: number; contractorLicense?: string }> {
        const extractorName = this.getName();
        if (!this.page || !this.browser) {
            throw new Error("Page or browser not initialized");
        }

        // Convert relative URL to absolute if needed
        // Handle both hash-based routes (#/permit/...) and full URLs
        let absoluteUrl: string;
        if (detailUrl.startsWith('http')) {
            absoluteUrl = detailUrl;
        } else {
            // Hash-based route (#/permit/...) or path - append to base URL
            const baseUrl = this.getBaseUrl();
            if (detailUrl.startsWith('#')) {
                // Hash route: #/permit/xxx
                absoluteUrl = `${baseUrl}/apps/SelfService${detailUrl}`;
            } else if (detailUrl.startsWith('/')) {
                // Absolute path: /permit/xxx
                absoluteUrl = `${baseUrl}${detailUrl}`;
            } else {
                // Relative path: permit/xxx
                absoluteUrl = `${baseUrl}/apps/SelfService/${detailUrl}`;
            }
        }

        // Open detail page in a new tab
        const detailPage = await this.browser.newPage();
        try {
            const response = await detailPage.goto(absoluteUrl, {
                waitUntil: "networkidle2",
                timeout: 30000,
            });

            // Check for 403 Forbidden (rate limiting)
            if (response && response.status() === 403) {
                console.error(`[${extractorName}] ❌ 403 Forbidden detected for ${absoluteUrl}`);
                throw new Error(`403 Forbidden - Rate limiting detected for ${absoluteUrl}`);
            }

            // Wait for AngularJS to be ready
            await this.waitForAngular(detailPage);
            
            // Extract permit number from URL for logging
            const permitMatch = detailUrl.match(/[A-Z0-9-]+$/);
            const permitId = permitMatch ? permitMatch[0] : "unknown";

            // Wait for "No records to display" message to disappear (indicates content is loading)
            console.log(`[${extractorName}] ⏳ Waiting for content to load (checking for "No records to display" message)...`);
            try {
                await detailPage.waitForFunction(
                    () => {
                        // Check if "No records to display" message exists and is visible
                        const noRecordsElements = (globalThis as any).document.querySelectorAll('*');
                        let hasNoRecordsMessage = false;
                        for (const el of noRecordsElements) {
                            const text = (el.textContent || el.innerText || '').toLowerCase();
                            if (text.includes('no records to display') || text.includes('no records')) {
                                const style = (globalThis as any).window.getComputedStyle(el);
                                if (style.display !== 'none' && el.offsetParent !== null) {
                                    hasNoRecordsMessage = true;
                                    break;
                                }
                            }
                        }
                        // Return true when the message is gone (or never existed)
                        return !hasNoRecordsMessage;
                    },
                    { timeout: 30000 } // Wait up to 30 seconds for content to load
                );
                console.log(`[${extractorName}] ✅ "No records to display" message disappeared or never appeared`);
            } catch (e) {
                console.log(`[${extractorName}] ⚠️  Timeout waiting for "No records to display" to disappear, continuing anyway...`);
            }

            // Wait a bit more for Angular to finish rendering
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.waitForAngular(detailPage);

            // Check if page shows 403 Forbidden (sometimes response status is 200 but page content shows 403)
            const pageContent = await detailPage.content();
            if (pageContent.includes('403 Forbidden') || (pageContent.includes('403') && pageContent.toLowerCase().includes('forbidden'))) {
                console.error(`[${extractorName}] ❌ 403 Forbidden detected in page content for ${absoluteUrl}`);
                throw new Error(`403 Forbidden - Rate limiting detected (page content shows 403)`);
            }

            // Extract Valuation
            let value: number | undefined;
            try {
                // Wait for Valuation field to appear with actual content - try multiple selector patterns
                // Increase timeout significantly since content takes time to load
                try {
                    await detailPage.waitForFunction(
                        () => {
                            const selectors = [
                                '#label-PermitDetail-Valuation p.form-control-static',
                                '#label-PermitDetail-Valuation p.ng-binding',
                                '#label-PermitDetail-Valuation p',
                                'div[id="label-PermitDetail-Valuation"] p.form-control-static',
                                'div[id*="Valuation"] p.form-control-static',
                                'div[id*="Valuation"] p.ng-binding',
                            ];
                            
                            for (const selector of selectors) {
                                const el = (globalThis as any).document.querySelector(selector);
                                if (el) {
                                    const text = (el.textContent || el.value || '').trim();
                                    if (text && text !== 'No records to display' && !text.toLowerCase().includes('no records')) {
                                        // Check if it's a valid number
                                        const cleaned = text.replace(/[$,\s]/g, '');
                                        const parsed = parseFloat(cleaned);
                                        if (!isNaN(parsed) && parsed > 0) {
                                            return true;
                                        }
                                    }
                                }
                            }
                            return false;
                        },
                        { timeout: 15000 } // Wait up to 15 seconds for valuation to appear with content
                    );
                } catch (e) {
                    // Fallback: wait for the form-group div itself (even if empty)
                    await detailPage.waitForSelector(
                        '#label-PermitDetail-Valuation, div[id*="Valuation"]',
                        { timeout: 10000 }
                    );
                }

                value = await detailPage.evaluate(() => {
                    // Try multiple selectors for Valuation
                    // Based on actual HTML structure: id="label-PermitDetail-Valuation" with <p class="form-control-static ng-binding">
                    const selectors = [
                        '#label-PermitDetail-Valuation p.form-control-static',
                        '#label-PermitDetail-Valuation p.ng-binding',
                        '#label-PermitDetail-Valuation p',
                        'div[id="label-PermitDetail-Valuation"] p.form-control-static',
                        'div[id*="Valuation"] p.form-control-static',
                        'div[id*="Valuation"] p.ng-binding',
                        // Fallback selectors (old format)
                        'div[name="label-Valuation"] span',
                        'div[label*="Valuation"] span',
                        'input[name*="Valuation"]',
                        '[name*="Valuation"]',
                    ];

                    for (const selector of selectors) {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const el = document.querySelector(selector);
                        if (el) {
                            const text = (el.textContent || el.value || '').trim();
                            // Filter out "No records to display" and similar loading messages
                            if (text && 
                                text !== 'No records to display' && 
                                !text.toLowerCase().includes('no records') &&
                                !text.toLowerCase().includes('loading')) {
                                // Remove $, commas, and parse
                                const cleaned = text.replace(/[$,\s]/g, '');
                                const parsed = parseFloat(cleaned);
                                if (!isNaN(parsed) && parsed > 0) {
                                    return parsed;
                                }
                            }
                        }
                    }
                    return undefined;
                });

                if (value !== undefined) {
                    console.log(`[${extractorName}]   ✓ Valuation extracted: $${value.toLocaleString()}`);
                } else {
                    console.log(`[${extractorName}]   ⚠️  Valuation not found`);
                }
            } catch (e) {
                console.log(`[${extractorName}]   ⚠️  Error extracting valuation: ${e instanceof Error ? e.message : String(e)}`);
            }

            // Extract Contractor License # from More Info tab (if enabled)
            let contractorLicense: string | undefined;
            if (this.shouldExtractContractorInfo()) {
                try {
                    // Click on More Info tab
                    const moreInfoTabClicked = await detailPage.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const moreInfoBtn = document.getElementById('button-TabButton-MoreInfo') as HTMLElement;
                    if (!moreInfoBtn) return false;

                    // @ts-expect-error - page.evaluate runs in browser context
                    const angular = window.angular;
                    if (angular) {
                        const element = angular.element(moreInfoBtn);
                        const scope = element.scope();
                        if (scope && scope.vm && scope.vm.tabNavigatorService) {
                            scope.$apply(() => {
                                // Navigate to More Info tab
                                if (scope.vm.tabNavigatorService.navigate) {
                                    scope.vm.tabNavigatorService.navigate(scope.vm.tabNavigatorService.tabConstant.Moreinfo);
                                }
                            });
                        }
                    }
                    moreInfoBtn.click();
                    return true;
                });

                if (moreInfoTabClicked) {
                    // Wait for tab to load
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await this.waitForAngular(detailPage);

                    // Extract Contractor License #
                    contractorLicense = await detailPage.evaluate(() => {
                        // Try multiple selectors for Contractor License #
                        const selectors = [
                            '#NUM_ContractorLicense',
                            'span[name="NUM_ContractorLicense"]',
                            'span[id="NUM_ContractorLicense"]',
                            'div[id="NUM_ContractorLicense"] span',
                        ];

                        for (const selector of selectors) {
                            // @ts-expect-error - page.evaluate runs in browser context
                            const el = document.querySelector(selector);
                            if (el) {
                                const text = (el.textContent || '').trim();
                                // Only return if it's a valid license number (6-8 digits)
                                // Filter out labels like "Contractor License #" or empty values
                                if (text && 
                                    text !== 'N/A' && 
                                    text !== '' && 
                                    text !== '&nbsp;' &&
                                    !text.toLowerCase().includes('contractor license') &&
                                    /^\d{6,8}$/.test(text)) { // Must be 6-8 digits only
                                    return text;
                                }
                            }
                        }
                        return undefined;
                    });
                } else {
                    // More Info button not found
                }
                } catch (e) {
                    // Ignore errors extracting Contractor License
                }
            } else {
                // Log that we're skipping contractor info extraction
                // (only log occasionally to avoid spam)
            }

            return { value, contractorLicense };
        } finally {
            await detailPage.close();
        }
    }

    /**
     * Set up search filters (select Permit, click Advanced, set dates)
     */
    protected async setupSearchFilters(page: Page, startDateStr: string, endDateStr?: string): Promise<void> {
        // Only set toDateStr if endDateStr is provided
        const toDateStr = endDateStr || null;
        // Wait for AngularJS to be ready
        await this.waitForAngular(page);

        // Step 1: Select "Permit" from Search dropdown
        await page.waitForSelector('#SearchModule', {
            timeout: 10000,
        });

        // Wait a bit for Angular to populate options
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.waitForAngular(page);

        // Find which option index has "Permit"
        const permitOptionIndex = await page.evaluate(() => {
            // @ts-expect-error - page.evaluate runs in browser context where document exists
            const select = document.getElementById('SearchModule') as HTMLSelectElement;
            if (!select) return -1;
            for (let i = 0; i < select.options.length; i++) {
                const option = select.options[i];
                // Check multiple properties: text, textContent, innerText, label
                const text = (option.text || option.textContent || option.innerText || option.label || '').toLowerCase().trim();
                if (text === 'permit' || text.includes('permit')) {
                    return i;
                }
            }
            return -1;
        });

        if (permitOptionIndex === -1) {
            throw new Error("Could not find Permit option in SearchModule dropdown");
        }

        // Select the Permit option and trigger Angular properly
        await page.evaluate((index: number) => {
            // @ts-expect-error - page.evaluate runs in browser context where document exists
            const select = document.getElementById('SearchModule') as HTMLSelectElement;
            if (!select) return;

            const option = select.options[index];
            select.selectedIndex = index;
            const optionValue = option.value; // This is "number:2"

            // Extract the numeric value (2) from "number:2"
            let numericValue: number;
            if (optionValue.includes(':')) {
                numericValue = parseInt(optionValue.split(':')[1], 10);
            } else {
                numericValue = parseInt(optionValue, 10);
            }

            // Trigger Angular's ng-change handler
            // @ts-expect-error - page.evaluate runs in browser context where window exists
            const angular = window.angular;
            if (angular) {
                const element = angular.element(select);
                const scope = element.scope();
                if (scope && scope.vm && scope.vm.model) {
                    scope.$apply(() => {
                        // Set the model value (which should be the numeric FilterValue)
                        scope.vm.model.SearchModule = numericValue;
                        // Call the change handler if it exists
                        if (scope.vm.changeSearchModule) {
                            scope.vm.changeSearchModule();
                        }
                    });
                }
            }

            // Also trigger native change event
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }, permitOptionIndex);

        // Wait for Angular to process the change and update the DOM
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.waitForAngular(page);

        // Step 2: Wait for and click "Advanced" button to expand filters
        // Wait for Advanced button to appear (it's hidden when "All" is selected)
        try {
            await page.waitForSelector('#button-Advanced:not(.ng-hide)', {
                timeout: 10000
            });
        } catch (e) {
            // If selector doesn't work, try checking visibility manually
            const isVisible = await page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const btn = document.getElementById('button-Advanced');
                if (!btn) return false;
                // @ts-expect-error - page.evaluate runs in browser context
                const style = window.getComputedStyle(btn);
                return style.display !== 'none' && !btn.classList.contains('ng-hide');
            });

            if (!isVisible) {
                throw new Error("Advanced button is not visible after selecting Permit. Make sure Permit is properly selected.");
            }
        }

        // Click Advanced button using JavaScript to trigger Angular's ng-click
        const advancedClicked = await page.evaluate(() => {
            // @ts-expect-error - page.evaluate runs in browser context
            const btn = document.getElementById('button-Advanced') as HTMLElement;
            if (!btn) {
                return { success: false, error: 'Advanced button not found' };
            }

            // Check if it's visible
            // @ts-expect-error - page.evaluate runs in browser context
            const style = window.getComputedStyle(btn);
            if (style.display === 'none' || btn.classList.contains('ng-hide')) {
                return { success: false, error: 'Advanced button is hidden' };
            }

            // @ts-expect-error - page.evaluate runs in browser context
            const angular = window.angular;
            if (angular) {
                // Get the form scope to access vm
                // @ts-expect-error - page.evaluate runs in browser context
                const form = document.querySelector('form[name="energovSearchForm"]');
                if (form) {
                    const formElement = angular.element(form);
                    const formScope = formElement.scope();
                    
                    if (formScope && formScope.vm) {
                        formScope.$apply(() => {
                            // Try to set expandStatus directly if method doesn't exist
                            if (formScope.vm.setExpandStatus) {
                                formScope.vm.setExpandStatus();
                            } else if (formScope.vm.expandStatus !== undefined) {
                                // Directly set expandStatus if the property exists
                                formScope.vm.expandStatus = !formScope.vm.expandStatus;
                            }
                        });
                    }
                }

                // Also try via button scope
                const element = angular.element(btn);
                const scope = element.scope();
                if (scope && scope.vm) {
                    scope.$apply(() => {
                        if (scope.vm.setExpandStatus) {
                            scope.vm.setExpandStatus();
                        } else if (scope.vm.expandStatus !== undefined) {
                            scope.vm.expandStatus = !scope.vm.expandStatus;
                        }
                    });
                }
            }

            // Also trigger native click
            btn.click();
            return { success: true };
        });

        if (!advancedClicked.success) {
            throw new Error(`Could not click Advanced button: ${advancedClicked.error}`);
        }

        // Wait for Advanced filters to appear
        // Wait a moment for Angular to process the click
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.waitForAngular(page);

        // Wait for the permit filter section (#collapseFilter) to appear
        try {
            await page.waitForSelector('#collapseFilter', {
                timeout: 15000
            });
        } catch (e) {
            // If collapseFilter doesn't appear, check the Angular state
            const stateInfo = await page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const angular = window.angular;
                if (angular) {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const form = document.querySelector('form[name="energovSearchForm"]');
                    if (form) {
                        const scope = angular.element(form).scope();
                        if (scope && scope.vm) {
                            return {
                                expandStatus: scope.vm.expandStatus,
                                searchModule: scope.vm.model?.SearchModule,
                                permitModule: scope.vm.permitModule,
                                // @ts-expect-error - page.evaluate runs in browser context
                                collapseFilterExists: document.getElementById('collapseFilter') !== null,
                                // @ts-expect-error - page.evaluate runs in browser context
                                applyDateFromExists: document.getElementById('ApplyDateFrom') !== null
                            };
                        }
                    }
                }
                return null;
            });

            // Retry clicking Advanced if expandStatus is false
            if (stateInfo && !stateInfo.expandStatus) {
                // Retry clicking Advanced multiple times
                for (let retry = 0; retry < 3; retry++) {
                    await page.evaluate(() => {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const btn = document.getElementById('button-Advanced') as HTMLElement;
                        if (btn) {
                            // @ts-expect-error - page.evaluate runs in browser context
                            const angular = window.angular;
                            if (angular) {
                                const element = angular.element(btn);
                                const scope = element.scope();
                                if (scope && scope.vm) {
                                    scope.$apply(() => {
                                        if (scope.vm.setExpandStatus) {
                                            scope.vm.setExpandStatus();
                                        } else if (scope.vm.expandStatus !== undefined) {
                                            scope.vm.expandStatus = true;
                                        }
                                    });
                                }
                            }
                            btn.click();
                        }
                    });
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await this.waitForAngular(page);

                    // Check if filter elements are now visible
                    const nowVisible = await page.evaluate(() => {
                        // @ts-expect-error - page.evaluate runs in browser context
                        return document.getElementById('collapseFilter') !== null ||
                               // @ts-expect-error - page.evaluate runs in browser context
                               document.getElementById('ApplyDateFrom') !== null;
                    });

                    if (nowVisible) {
                        break;
                    }
                }
            }

            // Final check - try to find either collapseFilter or ApplyDateFrom
            let filterFound = false;
            try {
                await page.waitForSelector('#collapseFilter, #ApplyDateFrom', { timeout: 5000 });
                filterFound = true;
            } catch (e2) {
                // Check if ApplyDateFrom exists even if not visible
                const hasDateInput = await page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const applyDateFrom = document.getElementById('ApplyDateFrom');
                    // @ts-expect-error - page.evaluate runs in browser context
                    const applyDateTo = document.getElementById('ApplyDateTo');
                    return applyDateFrom !== null || applyDateTo !== null;
                });
                
                if (hasDateInput) {
                    filterFound = true;
                } else {
                    throw new Error(`Could not find permit filter section. State: ${JSON.stringify(stateInfo)}`);
                }
            }
        }

        // Step 3: Set Applied Date (From)
        await page.waitForSelector('#ApplyDateFrom', { timeout: 10000 });

        // Wait a bit more for Angular to finish rendering
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.waitForAngular(page);

        // Set date using Angular model (more reliable than typing)
        // Try PermitCriteria.ApplyDateFrom first (Sunnyvale style), then fallback to ApplyDateFrom
        const appliedDateSet = await page.evaluate((dateValue: string) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const input = document.getElementById('ApplyDateFrom');
            if (!input) return false;

            // @ts-expect-error - page.evaluate runs in browser context
            const angular = window.angular;
            if (angular) {
                // @ts-expect-error - page.evaluate runs in browser context
                const form = document.querySelector('form[name="energovSearchForm"]');
                if (form) {
                    const element = angular.element(form);
                    const scope = element.scope();
                    if (scope && scope.vm && scope.vm.model) {
                        scope.$apply(() => {
                            // Try PermitCriteria path first (Sunnyvale)
                            if (scope.vm.model.PermitCriteria) {
                                scope.vm.model.PermitCriteria.ApplyDateFrom = dateValue;
                            } else {
                                // Fallback to direct path
                                scope.vm.model.ApplyDateFrom = dateValue;
                            }
                        });

                        // Also set via the input's ngModel controller
                        const inputElement = angular.element(input);
                        const inputScope = inputElement.scope();
                        if (inputScope) {
                            inputScope.$apply(() => {
                                const controller = inputElement.controller('ngModel');
                                if (controller) {
                                    controller.$setViewValue(dateValue);
                                }
                            });
                        }

                        // Set the input value directly too
                        // @ts-expect-error - page.evaluate runs in browser context
                        (input as HTMLInputElement).value = dateValue;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));

                        return true;
                    }
                }
            }

            // Fallback: just set the value directly
            if (input) {
                (input as any).value = dateValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        }, startDateStr);

        await new Promise((resolve) => setTimeout(resolve, 1000));
        await this.waitForAngular(page);

        // Step 4: Set Applied Date (To) - only if endDateStr is provided
        if (toDateStr) {
            const toDateSet = await page.evaluate((dateValue: string) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const input = document.getElementById('ApplyDateTo');
            if (!input) return false;

            // @ts-expect-error - page.evaluate runs in browser context
            const angular = window.angular;
            if (angular) {
                // @ts-expect-error - page.evaluate runs in browser context
                const form = document.querySelector('form[name="energovSearchForm"]');
                if (form) {
                    const element = angular.element(form);
                    const scope = element.scope();
                    if (scope && scope.vm && scope.vm.model) {
                        scope.$apply(() => {
                            // Try PermitCriteria path first (Sunnyvale)
                            if (scope.vm.model.PermitCriteria) {
                                scope.vm.model.PermitCriteria.ApplyDateTo = dateValue;
                            } else {
                                // Fallback to direct path
                                scope.vm.model.ApplyDateTo = dateValue;
                            }
                        });

                        // Also set via the input's ngModel controller
                        const inputElement = angular.element(input);
                        const inputScope = inputElement.scope();
                        if (inputScope) {
                            inputScope.$apply(() => {
                                const controller = inputElement.controller('ngModel');
                                if (controller) {
                                    controller.$setViewValue(dateValue);
                                }
                            });
                        }

                        // Set the input value directly too
                        // @ts-expect-error - page.evaluate runs in browser context
                        (input as HTMLInputElement).value = dateValue;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));

                        return true;
                    }
                }
            }

            // Fallback: just set the value directly
            if (input) {
                (input as any).value = dateValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        }, toDateStr);

            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.waitForAngular(page);
        }
    }

    /**
     * Perform search by clicking the Search button
     */
    protected async performSearch(page: Page): Promise<void> {
        // Click Search button
        await page.evaluate(() => {
            // @ts-expect-error - page.evaluate runs in browser context
            const btn = document.getElementById('button-Search') as HTMLElement;
            if (btn) {
                // @ts-expect-error - page.evaluate runs in browser context
                const angular = window.angular;
                if (angular) {
                    const element = angular.element(btn);
                    const scope = element.scope();
                    if (scope && scope.vm && scope.vm.search) {
                        scope.$apply(() => {
                            scope.vm.search();
                        });
                    }
                }
                btn.click();
            }
        });

        // Wait for search results
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await this.waitForAngular(page);

        // Wait for results to appear
        try {
            await page.waitForSelector(
                'div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]',
                { timeout: 15000 }
            );
        } catch (e) {
            // Results might be empty, that's okay
        }
    }

    /**
     * Parse permit data from the search results page
     */
    protected async parsePermitData(limit?: number): Promise<PermitData[]> {
        if (!this.page) {
            throw new Error("Page not initialized");
        }

        const extractorName = this.getName();
        const permits: PermitData[] = [];

        // Find all permit result divs
        // Each permit is in a div with ng-repeat="record in vm.getEntityRecords()"
        const permitDivs = await this.page.$$('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');
        const totalPermits = permitDivs.length;
        
        if (totalPermits === 0) {
            console.log(`[${extractorName}] No permits found on current page`);
            return permits;
        }

        console.log(`[${extractorName}] Found ${totalPermits} permit(s) on current page, extracting details...`);

        for (let i = 0; i < permitDivs.length; i++) {
            if (limit && permits.length >= limit) break;
            
            const permitStartTime = Date.now();
            const permitDiv = permitDivs[i];

            try {
                // Extract permit number
                const permitNumberStartTime = Date.now();
                const permitNumberEl = await permitDiv.$('div[name="label-CaseNumber"] a, div[id*="entityRecord"] a[href*="permit"]');
                const permitNumber = permitNumberEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", permitNumberEl)
                    : undefined;
                const permitNumberTime = Date.now() - permitNumberStartTime;

                if (!permitNumber) {
                    console.log(`[${extractorName}] ⚠️  Permit ${i + 1}/${totalPermits}: No permit number found (${permitNumberTime}ms)`);
                    continue;
                }
                
                console.log(`[${extractorName}] 📋 Processing permit ${i + 1}/${totalPermits}: ${permitNumber} (permit number extraction: ${permitNumberTime}ms)`);

                // Extract basic fields from search results page
                const basicFieldsStartTime = Date.now();
                
                // Extract applied date
                const appliedDateEl = await permitDiv.$('div[name="label-ApplyDate"] span, div[label*="Applied Date"] span');
                const appliedDateString = appliedDateEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", appliedDateEl)
                    : undefined;
                const appliedDate = appliedDateString ? this.parseDate(appliedDateString) : undefined;

                // Extract status
                const statusEl = await permitDiv.$('div[name="label-Status"] tyler-highlight, div[label*="Status"] tyler-highlight');
                const statusText = statusEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", statusEl)
                    : undefined;
                
                // Extract issued date - if it exists, status should be ISSUED
                const issuedDateEl = await permitDiv.$('div[name="label-IssuedDate"] span, div[label*="Issued Date"] span');
                const issuedDateString = issuedDateEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", issuedDateEl)
                    : undefined;
                
                // If Issued Date exists and is not empty, status is ISSUED
                // Otherwise, normalize from status text with IN_REVIEW as default
                let status: string;
                if (issuedDateString && issuedDateString.trim() !== '') {
                    status = "ISSUED";
                } else {
                    status = this.normalizeStatus(statusText);
                    // Default to IN_REVIEW instead of UNKNOWN for Energov systems
                    if (status === "UNKNOWN") {
                        status = "IN_REVIEW";
                    }
                }

                // Extract type
                const typeEl = await permitDiv.$('div[name="label-CaseType"] tyler-highlight, div[label*="Type"] tyler-highlight');
                const permitType = typeEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", typeEl)
                    : undefined;

                // Extract address
                const addressEl = await permitDiv.$('div[name="label-Address"] tyler-highlight, div[label*="Address"] tyler-highlight');
                const addressText = addressEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", addressEl)
                    : undefined;
                const { address, zipCode } = this.parseAddress(addressText || "");

                // Extract description
                const descEl = await permitDiv.$('div[name="label-Description"] tyler-highlight, div[label*="Description"] tyler-highlight');
                const description = descEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", descEl)
                    : undefined;


                // Extract expiration date (optional)
                const expDateEl = await permitDiv.$('div[name="label-ExpiredDate"] span, div[label*="Expiration Date"] span');
                const expirationDateString = expDateEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", expDateEl)
                    : undefined;
                const expirationDate = expirationDateString ? this.parseDate(expirationDateString) : undefined;

                // Build source URL (link to permit detail page)
                let sourceUrl: string | undefined;
                if (permitNumberEl) {
                    const href = await this.page.evaluate((el: any) => {
                        if (el.tagName === 'A') {
                            return el.href;
                        }
                        const anchor = el.querySelector('a');
                        return anchor ? anchor.href : null;
                    }, permitNumberEl);
                    if (href) {
                        sourceUrl = href;
                    }
                }
                
                const basicFieldsTime = Date.now() - basicFieldsStartTime;
                console.log(`[${extractorName}]   ✓ Basic fields extracted (${basicFieldsTime}ms)`);

                // Extract Valuation and Contractor License from detail page
                let value: number | undefined;
                let contractorLicense: string | undefined;
                
                // Check if detail page extraction is enabled for this extractor
                if (this.shouldExtractDetailPageData() && sourceUrl) {
                    // Wait 10 seconds between detail pages to avoid rate limiting (skip for first permit)
                    if (i > 0) {
                        console.log(`[${extractorName}]   ⏳ Waiting 10 seconds before opening next detail page...`);
                        await new Promise((resolve) => setTimeout(resolve, 10000));
                    }
                    
                    const detailPageStartTime = Date.now();
                    try {
                        console.log(`[${extractorName}]   🔍 Opening detail page for ${permitNumber}...`);
                        const detailData = await this.extractDetailPageData(sourceUrl);
                        const detailPageTime = Date.now() - detailPageStartTime;
                        value = detailData.value;
                        contractorLicense = detailData.contractorLicense;
                        console.log(`[${extractorName}]   ✓ Detail page extracted (${detailPageTime}ms) - value: ${value || 'N/A'}, contractor: ${contractorLicense || 'N/A'}`);
                    } catch (error: any) {
                        const detailPageTime = Date.now() - detailPageStartTime;
                        // Ignore errors extracting detail data
                        console.log(`[${extractorName}]   ⚠️  Could not extract detail data for ${permitNumber} (${detailPageTime}ms): ${error.message}`);
                    }
                } else {
                    console.log(`[${extractorName}]   ⏭️  Skipping detail page extraction for ${permitNumber} (disabled by extractor configuration)`);
                }

                const permit: PermitData = {
                    permitNumber,
                    title: permitType,
                    description,
                    address,
                    city: this.city, // Explicitly set from constructor
                    state: this.state, // Explicitly set from constructor
                    zipCode,
                    permitType,
                    status,
                    value,
                    appliedDate,
                    appliedDateString,
                    expirationDate,
                    sourceUrl,
                    licensedProfessionalText: contractorLicense, // Store contractor license from More Info tab
                };

                if (this.validatePermitData(permit)) {
                    permits.push(permit);
                    const permitTotalTime = Date.now() - permitStartTime;
                    console.log(`[${extractorName}]   ✅ Permit ${permitNumber} completed (total: ${permitTotalTime}ms)`);
                } else {
                    const permitTotalTime = Date.now() - permitStartTime;
                    console.log(`[${extractorName}]   ⚠️  Permit ${permitNumber} failed validation (total: ${permitTotalTime}ms)`);
                }
            } catch (error: any) {
                const permitTotalTime = Date.now() - permitStartTime;
                console.log(`[${extractorName}]   ❌ Error processing permit ${i + 1}/${totalPermits} (${permitTotalTime}ms): ${error.message}`);
                // Continue on error for individual permits
            }
        }

        return permits;
    }

    /**
     * Navigate through pagination if needed
     */
    protected async navigatePages(page: Page, limit?: number): Promise<PermitData[]> {
        const extractorName = this.getName();
        const allPermits: PermitData[] = [];
        const seenPermitNumbers = new Set<string>();
        let pageNum = 1;
        
        // Set up console error and page error listeners
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                const errorText = msg.text();
                consoleErrors.push(errorText);
                console.error(`[${extractorName}] Browser console error: ${errorText}`);
            }
        });
        
        page.on('pageerror', (error: unknown) => {
            const errorText = error instanceof Error ? error.message : String(error);
            pageErrors.push(errorText);
            console.error(`[${extractorName}] Page error: ${errorText}`);
        });
        
        page.on('requestfailed', (request) => {
            const failure = request.failure();
            const failureText = `${request.url()} - ${failure?.errorText || 'Unknown error'}`;
            console.error(`[${extractorName}] Request failed: ${failureText}`);
            
            // Log response if available
            const response = request.response();
            if (response) {
                console.error(`[${extractorName}] Response status: ${response.status()} ${response.statusText()}`);
            }
        });
        
        // Also listen for responses with error status codes
        page.on('response', (response) => {
            const status = response.status();
            if (status >= 400) {
                console.error(`[${extractorName}] HTTP ${status} error for: ${response.url()}`);
            }
        });

        while (true) {
            console.log(`[${extractorName}] 📄 Processing page ${pageNum}...`);
            
            // Get the first permit number on current page before extracting (for verification)
            const firstPermitNumberBefore = await page.evaluate(() => {
                const firstPermitDiv = (globalThis as any).document.querySelector('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');
                if (firstPermitDiv) {
                    const permitNumberEl = firstPermitDiv.querySelector('div[name="label-CaseNumber"] a, div[id*="entityRecord"] a[href*="permit"]');
                    return permitNumberEl ? permitNumberEl.textContent?.trim() : null;
                }
                return null;
            });
            
            const permits = await this.parsePermitData(limit ? limit - allPermits.length : undefined);
            
            // Deduplicate permits by permitNumber
            const uniquePermits = permits.filter((permit) => {
                if (seenPermitNumbers.has(permit.permitNumber)) {
                    console.log(`[${extractorName}] ⚠️  Skipping duplicate permit ${permit.permitNumber} on page ${pageNum}`);
                    return false;
                }
                seenPermitNumbers.add(permit.permitNumber);
                return true;
            });
            
            if (uniquePermits.length > 0) {
                console.log(`[${extractorName}] Extracted permit numbers from page ${pageNum}:`);
                uniquePermits.forEach((permit, index) => {
                    console.log(`   ${index + 1}. ${permit.permitNumber}${permit.appliedDateString ? ` (applied: ${permit.appliedDateString})` : ""}`);
                });
            }
            
            if (uniquePermits.length < permits.length) {
                console.log(`[${extractorName}] ⚠️  Filtered out ${permits.length - uniquePermits.length} duplicate permit(s) on page ${pageNum}`);
            }
            
            allPermits.push(...uniquePermits);
            console.log(`[${extractorName}] Page ${pageNum} complete: ${uniquePermits.length} unique permit(s) extracted (total: ${allPermits.length})`);

            if (limit && allPermits.length >= limit) {
                console.log(`[${extractorName}] Reached limit of ${limit} permits`);
                break;
            }

            // Check if there's a next page by looking for the next page number button
            const paginationInfo = await page.evaluate((currentPageNum) => {
                // Find the next page number button (e.g., link-Page2, link-Page3, etc.)
                const nextPageId = `link-Page${currentPageNum + 1}`;
                const nextPageBtn = (globalThis as any).document.getElementById(nextPageId);
                
                if (nextPageBtn) {
                    // Check if the parent <li> has 'disabled' class
                    const parentLi = nextPageBtn.closest('li');
                    const isDisabled = parentLi && parentLi.classList.contains('disabled');
                    return {
                        hasNextPage: !isDisabled,
                        nextPageId,
                        nextPageBtn: nextPageBtn ? true : false,
                    };
                }
                
                // Fallback: check if Next button is enabled (for cases where page numbers aren't shown)
                const nextBtnEnergov = (globalThis as any).document.getElementById('link-NextPage');
                if (nextBtnEnergov) {
                    const parentLi = nextBtnEnergov.closest('li');
                    const isDisabled = parentLi && parentLi.classList.contains('disabled');
                    return {
                        hasNextPage: !isDisabled,
                        nextPageId: 'link-NextPage',
                        nextPageBtn: true,
                    };
                }
                
                return {
                    hasNextPage: false,
                    nextPageId: null,
                    nextPageBtn: false,
                };
            }, pageNum);

            if (!paginationInfo.hasNextPage) {
                console.log(`[${extractorName}] No more pages available`);
                break;
            }

            // Navigate to next page by clicking the specific page number button
            console.log(`[${extractorName}] Navigating to page ${pageNum + 1}...`);
            const clicked = await page.evaluate((nextPageId) => {
                if (!nextPageId) return false;
                
                // Try clicking the specific page number button first
                const pageBtn = (globalThis as any).document.getElementById(nextPageId);
                if (pageBtn) {
                    const parentLi = pageBtn.closest('li');
                    if (parentLi && !parentLi.classList.contains('disabled')) {
                        const angular = (globalThis as any).window.angular;
                        if (angular) {
                            const element = angular.element(pageBtn);
                            const scope = element.scope();
                            if (scope && scope.vm) {
                                // Try to call a method to go to the specific page
                                const pageNum = parseInt(nextPageId.replace('link-Page', ''), 10);
                                if (scope.vm.goToPage && typeof scope.vm.goToPage === 'function') {
                                    scope.$apply(() => {
                                        scope.vm.goToPage(pageNum);
                                    });
                                } else if (scope.vm.setPage && typeof scope.vm.setPage === 'function') {
                                    scope.$apply(() => {
                                        scope.vm.setPage(pageNum);
                                    });
                                }
                            }
                        }
                        pageBtn.click();
                        return true;
                    }
                }
                
                // Fallback: use Next button if page number button doesn't work
                if (nextPageId === 'link-NextPage') {
                    const nextBtnEnergov = (globalThis as any).document.getElementById('link-NextPage');
                    if (nextBtnEnergov) {
                        const parentLi = nextBtnEnergov.closest('li');
                        if (parentLi && !parentLi.classList.contains('disabled')) {
                            const angular = (globalThis as any).window.angular;
                            if (angular) {
                                const element = angular.element(nextBtnEnergov);
                                const scope = element.scope();
                                if (scope && scope.vm && scope.vm.nextPage) {
                                    scope.$apply(() => {
                                        scope.vm.nextPage();
                                    });
                                }
                            }
                            nextBtnEnergov.click();
                            return true;
                        }
                    }
                }
                
                return false;
            }, paginationInfo.nextPageId);
            
            if (!clicked) {
                console.warn(`[${extractorName}] Could not find or click next page button`);
                break;
            }

            // Check for error modals and console errors
            const checkForErrors = async () => {
                // Check for error modal
                const errorModalInfo = await page.evaluate(() => {
                    // Look for common error modal patterns - more comprehensive
                    const errorSelectors = [
                        '.modal[class*="error"]',
                        '.modal[class*="Error"]',
                        '[class*="error-modal"]',
                        '[class*="ErrorModal"]',
                        '.alert-danger',
                        '.alert[class*="error"]',
                        '[role="alert"]',
                        '.ui-dialog[class*="error"]',
                        '.modal-body',
                        '.modal-content',
                        '[class*="modal"]',
                        '[id*="modal"]',
                        '[id*="Modal"]',
                        '.dialog',
                        '[role="dialog"]',
                    ];
                    
                    for (const selector of errorSelectors) {
                        try {
                            const modals = (globalThis as any).document.querySelectorAll(selector);
                            for (const modal of modals) {
                                // Check if visible (not display:none or hidden)
                                const style = (globalThis as any).window.getComputedStyle(modal);
                                const isVisible = style.display !== 'none' && 
                                                style.visibility !== 'hidden' && 
                                                modal.offsetParent !== null;
                                
                                if (isVisible) {
                                    const text = (modal.textContent || modal.innerText || '').toLowerCase();
                                    // Check if it contains error-related keywords
                                    if (text.includes('error') || 
                                        text.includes('occurred') || 
                                        text.includes('failed') ||
                                        text.includes('problem') ||
                                        text.includes('unable') ||
                                        text.includes('cannot')) {
                                        return {
                                            found: true,
                                            selector,
                                            text: modal.textContent?.trim() || modal.innerText?.trim() || '',
                                            html: modal.innerHTML.substring(0, 1000), // Increased to 1000 chars
                                        };
                                    }
                                }
                            }
                        } catch (e) {
                            // Continue with next selector
                        }
                    }
                    
                    // Also check all visible elements with z-index (likely modals)
                    const allElements = (globalThis as any).document.querySelectorAll('*');
                    for (const el of allElements) {
                        const style = (globalThis as any).window.getComputedStyle(el);
                        const zIndex = parseInt(style.zIndex || '0', 10);
                        if (zIndex > 1000) { // High z-index likely means modal/overlay
                            const text = (el.textContent || el.innerText || '').toLowerCase();
                            if ((text.includes('error') || text.includes('occurred') || text.includes('failed')) &&
                                style.display !== 'none' && el.offsetParent !== null) {
                                return {
                                    found: true,
                                    selector: 'high-z-index-element',
                                    text: el.textContent?.trim() || el.innerText?.trim() || '',
                                    html: el.innerHTML.substring(0, 1000),
                                };
                            }
                        }
                    }
                    
                    return { found: false };
                });
                
                if (errorModalInfo.found) {
                    console.error(`[${extractorName}] ⚠️  ERROR MODAL DETECTED:`);
                    console.error(`[${extractorName}]    Selector: ${errorModalInfo.selector}`);
                    console.error(`[${extractorName}]    Text: ${errorModalInfo.text}`);
                    console.error(`[${extractorName}]    HTML snippet: ${errorModalInfo.html}`);
                }
                
                return { errorModalInfo };
            };

            // Check for errors after a short wait
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const errorCheck = await checkForErrors();
            
            if (errorCheck.errorModalInfo.found) {
                // Try to dismiss the modal and log details
                const dismissed = await page.evaluate(() => {
                    // Try to find and click close/dismiss buttons
                    const closeSelectors = [
                        '.modal .close',
                        '.modal button[aria-label*="close" i]',
                        '.modal button[aria-label*="dismiss" i]',
                        '.ui-dialog .ui-dialog-titlebar-close',
                        'button:contains("OK")',
                        'button:contains("Close")',
                        'button:contains("Dismiss")',
                    ];
                    
                    for (const selector of closeSelectors) {
                        try {
                            const btn = (globalThis as any).document.querySelector(selector);
                            if (btn && btn.offsetParent !== null) {
                                btn.click();
                                return true;
                            }
                        } catch (e) {
                            // Continue trying other selectors
                        }
                    }
                    return false;
                });
                
                if (dismissed) {
                    console.log(`[${extractorName}] ✅ Dismissed error modal`);
                } else {
                    console.warn(`[${extractorName}] ⚠️  Could not dismiss error modal automatically`);
                }
            }

            // Increased initial wait time after clicking next page
            console.log(`[${extractorName}] Waiting for page to load after clicking next...`);
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Increased from 2000ms to 5000ms
            await this.waitForAngular(page);
            
            // Check for errors again after waiting
            const errorCheckAfterWait = await checkForErrors();
            if (errorCheckAfterWait.errorModalInfo.found && !errorCheck.errorModalInfo.found) {
                console.error(`[${extractorName}] ⚠️  Error modal appeared after waiting`);
            }
            
            // Log accumulated console and page errors if any
            if (consoleErrors.length > 0) {
                console.error(`[${extractorName}] Total console errors so far: ${consoleErrors.length}`);
                consoleErrors.slice(-5).forEach((err, idx) => {
                    console.error(`[${extractorName}]   ${idx + 1}. ${err}`);
                });
            }
            if (pageErrors.length > 0) {
                console.error(`[${extractorName}] Total page errors so far: ${pageErrors.length}`);
                pageErrors.slice(-5).forEach((err, idx) => {
                    console.error(`[${extractorName}]   ${idx + 1}. ${err}`);
                });
            }
            
            // Verify that the page actually changed by checking the first permit number
            // Retry with longer wait if page hasn't changed (may still be loading)
            let firstPermitNumberAfter: string | null = null;
            let pageChanged = false;
            const maxRetries = 5; // Increased from 3 to 5
            
            for (let retry = 0; retry < maxRetries; retry++) {
                firstPermitNumberAfter = await page.evaluate(() => {
                    const firstPermitDiv = (globalThis as any).document.querySelector('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');
                    if (firstPermitDiv) {
                        const permitNumberEl = firstPermitDiv.querySelector('div[name="label-CaseNumber"] a, div[id*="entityRecord"] a[href*="permit"]');
                        return permitNumberEl ? permitNumberEl.textContent?.trim() : null;
                    }
                    return null;
                });
                
                if (firstPermitNumberBefore && firstPermitNumberAfter && firstPermitNumberBefore !== firstPermitNumberAfter) {
                    pageChanged = true;
                    console.log(`[${extractorName}] ✅ Verified page changed: first permit changed from ${firstPermitNumberBefore} to ${firstPermitNumberAfter}`);
                    break;
                }
                
                if (retry < maxRetries - 1) {
                    console.log(`[${extractorName}] ⏳ Page content hasn't changed yet (retry ${retry + 1}/${maxRetries}), waiting longer...`);
                    await new Promise((resolve) => setTimeout(resolve, 4000)); // Increased from 2000ms to 4000ms
                    await this.waitForAngular(page);
                }
            }
            
            if (firstPermitNumberBefore && firstPermitNumberAfter && !pageChanged) {
                console.warn(`[${extractorName}] ⚠️  Page ${pageNum + 1} still shows the same first permit (${firstPermitNumberBefore}) as page ${pageNum} after ${maxRetries} retries. Pagination may not have worked. Stopping.`);
                break;
            }
            
            pageNum++;
        }

        console.log(`[${extractorName}] ✅ Finished processing all pages: ${allPermits.length} total unique permit(s)`);
        return allPermits;
    }

    /**
     * Cleanup browser resources
     */
    protected async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

