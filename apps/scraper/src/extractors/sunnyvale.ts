/**
 * Sunnyvale Extractor implementation
 * Uses Puppeteer to interact with Energov/Tyler Technologies portal
 * Parses HTML results directly from search page (no CSV export available)
 */

import { BaseExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";
import * as path from "path";

export class SunnyvaleExtractor extends BaseExtractor {
    protected browser: Browser | null = null;
    protected page: Page | null = null;

    /**
     * Normalize Energov/Tyler status text to our PermitStatus enum
     * Maps Sunnyvale status values to: UNKNOWN, IN_REVIEW, ISSUED, INACTIVE
     */
    private normalizeStatus(raw?: string): string {
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
    private parseDate(dateStr: string): Date | undefined {
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
    private parseAddress(addressStr: string): { address: string; zipCode?: string } {
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
    private async waitForAngular(page: Page): Promise<void> {
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
            console.warn("[SunnyvaleExtractor] Could not detect AngularJS ready state, waiting...");
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    /**
     * Format date for Energov date inputs (MM/DD/YYYY)
     */
    private formatDate(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            console.log(`[SunnyvaleExtractor] Starting scrape for ${this.city}`);

            // Launch browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Navigate to search page
            console.log(`[SunnyvaleExtractor] Navigating to ${this.url}`);
            await this.page.goto(this.url, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            // Wait for AngularJS to be ready
            await this.waitForAngular(this.page);

            // Calculate date to search
            const searchDate = scrapeDate || new Date();
            const dateStr = this.formatDate(searchDate);
            console.log(`[SunnyvaleExtractor] Searching for permits with applied date: ${dateStr}`);

            // Step 1: Select "Permit" from Search dropdown
            console.log(`[SunnyvaleExtractor] Selecting 'Permit' from search dropdown...`);
            await this.page.waitForSelector('#SearchModule', {
                timeout: 10000,
            });

            // Wait a bit for Angular to populate options
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.waitForAngular(this.page);

            // Debug: List all available options
            const dropdownInfo = await this.page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context where document exists
                const select = document.getElementById('SearchModule') as HTMLSelectElement;
                if (!select) {
                    return { found: false, error: 'Select element not found' };
                }
                
                // @ts-expect-error - page.evaluate runs in browser context where HTMLOptionElement exists
                const options = Array.from(select.options).map((opt: HTMLOptionElement, idx: number) => ({
                    index: idx,
                    text: opt.text?.trim() || '',
                    value: opt.value,
                    label: opt.label?.trim() || ''
                }));
                
                return { found: true, options, length: select.options.length };
            });
            
            if (!dropdownInfo.found) {
                throw new Error("SearchModule dropdown not found");
            }
            
            console.log(`[SunnyvaleExtractor] Found ${dropdownInfo.length} options in dropdown:`, 
                dropdownInfo.options?.map(o => `"${o.text || o.label}" (value: ${o.value})`).join(', ') || 'no options');

            // Find which option index has "Permit"
            const permitOptionIndex = await this.page.evaluate(() => {
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
                throw new Error(`Could not find Permit option in dropdown. Available options: ${JSON.stringify(dropdownInfo.options)}`);
            }
            
            console.log(`[SunnyvaleExtractor] Found Permit at index ${permitOptionIndex}`);
            
            // Select the Permit option and trigger Angular properly
            await this.page.evaluate((index: number) => {
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

            console.log(`[SunnyvaleExtractor] Permit option selected, waiting for Angular to process...`);

            // Wait for Angular to process the change and update the DOM
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.waitForAngular(this.page);
            
            // Verify that Advanced button is now visible
            const advancedButtonVisible = await this.page.evaluate(() => {
                // @ts-expect-error - page.evaluate runs in browser context
                const btn = document.getElementById('button-Advanced');
                if (!btn) return false;
                // @ts-expect-error - page.evaluate runs in browser context
                const style = window.getComputedStyle(btn);
                return style.display !== 'none' && !btn.classList.contains('ng-hide');
            });
            
            if (!advancedButtonVisible) {
                console.warn(`[SunnyvaleExtractor] Advanced button not visible yet, waiting more...`);
                await new Promise((resolve) => setTimeout(resolve, 2000));
                await this.waitForAngular(this.page);
            }
            
            console.log(`[SunnyvaleExtractor] Permit selected, page should be updated`);

            // Step 2: Wait for and click "Advanced" button to expand filters
            console.log(`[SunnyvaleExtractor] Waiting for Advanced button to be visible...`);
            
            // Wait for Advanced button to appear (it's hidden when "All" is selected)
            try {
                await this.page.waitForSelector('#button-Advanced:not(.ng-hide)', {
                    timeout: 10000
                });
                console.log(`[SunnyvaleExtractor] Advanced button is visible`);
            } catch (e) {
                // If selector doesn't work, try checking visibility manually
                const isVisible = await this.page.evaluate(() => {
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
                console.log(`[SunnyvaleExtractor] Advanced button found via visibility check`);
            }
            
            // Click Advanced button using JavaScript to trigger Angular's ng-click
            console.log(`[SunnyvaleExtractor] Clicking 'Advanced' button...`);
            const advancedClicked = await this.page.evaluate(() => {
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
                
                // Trigger Angular's ng-click handler
                // @ts-expect-error - page.evaluate runs in browser context
                const angular = window.angular;
                if (angular) {
                    const element = angular.element(btn);
                    const scope = element.scope();
                    if (scope && scope.vm && scope.vm.setExpandStatus) {
                        scope.$apply(() => {
                            scope.vm.setExpandStatus();
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
            console.log(`[SunnyvaleExtractor] Waiting for Advanced filters to appear...`);
            
            // Wait a moment for Angular to process the click
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.waitForAngular(this.page);
            
            // Wait for the permit filter section (#collapseFilter) to appear
            // This section only appears when expandStatus is true AND SearchModule is permitModule
            try {
                await this.page.waitForSelector('#collapseFilter', { 
                    timeout: 15000
                });
                console.log(`[SunnyvaleExtractor] Permit filter section (#collapseFilter) found`);
            } catch (e) {
                // If collapseFilter doesn't appear, check the Angular state
                const stateInfo = await this.page.evaluate(() => {
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
                
                console.log(`[SunnyvaleExtractor] State check:`, JSON.stringify(stateInfo, null, 2));
                
                if (!stateInfo || !stateInfo.expandStatus) {
                    console.warn(`[SunnyvaleExtractor] expandStatus is false, trying to click Advanced again...`);
                    await this.page.evaluate(() => {
                        // @ts-expect-error - page.evaluate runs in browser context
                        const btn = document.getElementById('button-Advanced') as HTMLElement;
                        if (btn) {
                            // @ts-expect-error - page.evaluate runs in browser context
                            const angular = window.angular;
                            if (angular) {
                                const element = angular.element(btn);
                                const scope = element.scope();
                                if (scope && scope.vm && scope.vm.setExpandStatus) {
                                    scope.$apply(() => {
                                        scope.vm.setExpandStatus();
                                    });
                                }
                            }
                        }
                    });
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await this.waitForAngular(this.page);
                }
                
                // Try again to find collapseFilter or ApplyDateFrom
                const found = await this.page.evaluate(() => {
                    // @ts-expect-error - page.evaluate runs in browser context
                    return document.getElementById('collapseFilter') !== null || 
                           // @ts-expect-error - page.evaluate runs in browser context
                           document.getElementById('ApplyDateFrom') !== null;
                });
                
                if (!found) {
                    throw new Error("Permit filter section not found. Make sure Permit is selected and Advanced is clicked.");
                }
                console.log(`[SunnyvaleExtractor] Filter section found after retry`);
            }
            
            // Now wait for the ApplyDateFrom input field
            try {
                await this.page.waitForSelector('#ApplyDateFrom', { 
                    timeout: 10000
                });
                console.log(`[SunnyvaleExtractor] ApplyDateFrom input found in DOM`);
                
                // Wait a bit more for Angular to finish rendering
                await new Promise((resolve) => setTimeout(resolve, 1000));
                await this.waitForAngular(this.page);
            } catch (e) {
                throw new Error("ApplyDateFrom input field not found even though filter section is visible.");
            }
            
            // Set date via Angular model: vm.model.PermitCriteria.ApplyDateFrom
            console.log(`[SunnyvaleExtractor] Setting Applied Date via Angular model...`);
            const appliedDateSet = await this.page.evaluate((dateStr: string) => {
                // @ts-expect-error - page.evaluate runs in browser context
                const input = document.getElementById('ApplyDateFrom');
                if (!input) return false;
                
                // @ts-expect-error - page.evaluate runs in browser context
                const angular = window.angular;
                if (angular) {
                    // Get the scope from any element in the form
                    // @ts-expect-error - page.evaluate runs in browser context
                    const form = document.querySelector('form[name="energovSearchForm"]');
                    if (form) {
                        const element = angular.element(form);
                        const scope = element.scope();
                        if (scope && scope.vm && scope.vm.model && scope.vm.model.PermitCriteria) {
                            scope.$apply(() => {
                                // Set the model value directly
                                scope.vm.model.PermitCriteria.ApplyDateFrom = dateStr;
                            });
                            
                            // Also set via the input's ngModel controller
                            const inputElement = angular.element(input);
                            const inputScope = inputElement.scope();
                            if (inputScope) {
                                inputScope.$apply(() => {
                                    const controller = inputElement.controller('ngModel');
                                    if (controller) {
                                        controller.$setViewValue(dateStr);
                                    }
                                });
                            }
                            
                            // Set the input value directly too
                            // @ts-expect-error - page.evaluate runs in browser context
                            (input as HTMLInputElement).value = dateStr;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            
                            return true;
                        }
                    }
                }
                
                // Fallback: just set the value directly
                // @ts-expect-error - page.evaluate runs in browser context
                (input as HTMLInputElement).value = dateStr;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }, dateStr);
            
            if (!appliedDateSet) {
                throw new Error("Could not set Applied Date value");
            }
            
            console.log(`[SunnyvaleExtractor] Applied Date set to: ${dateStr}`);

            // Set "To" date using the same approach
            console.log(`[SunnyvaleExtractor] Setting To Date via Angular model...`);
            const toDateSet = await this.page.evaluate((dateStr: string) => {
                // @ts-expect-error - page.evaluate runs in browser context
                const input = document.getElementById('ApplyDateTo');
                if (!input) return false;
                
                // @ts-expect-error - page.evaluate runs in browser context
                const angular = window.angular;
                if (angular) {
                    // Get the scope from the form
                    // @ts-expect-error - page.evaluate runs in browser context
                    const form = document.querySelector('form[name="energovSearchForm"]');
                    if (form) {
                        const element = angular.element(form);
                        const scope = element.scope();
                        if (scope && scope.vm && scope.vm.model && scope.vm.model.PermitCriteria) {
                            scope.$apply(() => {
                                // Set the model value directly
                                scope.vm.model.PermitCriteria.ApplyDateTo = dateStr;
                            });
                            
                            // Also set via the input's ngModel controller
                            const inputElement = angular.element(input);
                            const inputScope = inputElement.scope();
                            if (inputScope) {
                                inputScope.$apply(() => {
                                    const controller = inputElement.controller('ngModel');
                                    if (controller) {
                                        controller.$setViewValue(dateStr);
                                    }
                                });
                            }
                            
                            // Set the input value directly too
                            // @ts-expect-error - page.evaluate runs in browser context
                            (input as HTMLInputElement).value = dateStr;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            
                            return true;
                        }
                    }
                }
                
                // Fallback: just set the value directly
                // @ts-expect-error - page.evaluate runs in browser context
                (input as HTMLInputElement).value = dateStr;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }, dateStr);
            
            if (!toDateSet) {
                // Fallback: try finding and clicking the input
                const toDateInput = await this.page.$('#ApplyDateTo');
                if (toDateInput) {
                    await this.page.evaluate((el) => {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, toDateInput);
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    
                    await toDateInput.click({ clickCount: 3 });
                    await toDateInput.type(dateStr);
                    await this.page.evaluate((el) => {
                        // @ts-expect-error - page.evaluate runs in browser context
                        (el as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
                    }, toDateInput);
                } else {
                    throw new Error("Could not find or set 'To' date input field (ApplyDateTo)");
                }
            }
            
            console.log(`[SunnyvaleExtractor] To Date set to: ${dateStr}`);
            
            // Wait a bit for Angular to process the changes
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 4: Click Search button
            console.log(`[SunnyvaleExtractor] Clicking 'Search' button...`);
            let searchButton = await this.page.$('button[ng-click*="search"], button[id*="Search"], button[type="submit"]');
            if (!searchButton) {
                // Try finding by text content
                const buttons = await this.page.$$("button");
                for (const button of buttons) {
                    const text = await this.page.evaluate((el) => el.textContent?.toLowerCase() || "", button);
                    if (text.includes("search") && !text.includes("clear")) {
                        searchButton = button;
                        break;
                    }
                }
            }
            if (searchButton) {
                await searchButton.click();
            } else {
                throw new Error("Could not find Search button");
            }

            // Wait for results to load
            console.log(`[SunnyvaleExtractor] Waiting for search results...`);
            await this.waitForAngular(this.page);
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Step 5: Parse results from all pages
            const permits: PermitData[] = [];
            let pageNum = 1;
            let hasMorePages = true;

            while (hasMorePages) {
                console.log(`[SunnyvaleExtractor] Parsing page ${pageNum}...`);

                // Parse current page
                const pagePermits = await this.parsePermitData(limit ? limit - permits.length : undefined);
                permits.push(...pagePermits);

                // Check if we've hit the limit
                if (limit && permits.length >= limit) {
                    console.log(`[SunnyvaleExtractor] Reached limit of ${limit} permits`);
                    break;
                }

                // Check for next page
                let nextPageLink = await this.page.$('a[id*="NextPage"], a[aria-label*="next page"]');
                if (!nextPageLink) {
                    // Try finding by text content ">" or "Next"
                    const links = await this.page.$$("a");
                    for (const link of links) {
                        const text = await this.page.evaluate((el) => el.textContent?.trim() || "", link);
                        const ariaLabel = await this.page.evaluate((el) => el.getAttribute("aria-label") || "", link);
                        if (text === ">" || text === "»" || ariaLabel?.toLowerCase().includes("next")) {
                            nextPageLink = link;
                            break;
                        }
                    }
                }
                if (nextPageLink) {
                    const isDisabled = await this.page.evaluate((el) => {
                        const parent = el.parentElement;
                        return parent?.classList.contains("disabled") || el.classList.contains("disabled");
                    }, nextPageLink);

                    if (!isDisabled) {
                        console.log(`[SunnyvaleExtractor] Navigating to page ${pageNum + 1}...`);
                        await nextPageLink.click();
                        await this.waitForAngular(this.page);
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                        pageNum++;
                    } else {
                        hasMorePages = false;
                    }
                } else {
                    hasMorePages = false;
                }
            }

            console.log(`[SunnyvaleExtractor] Scraped ${permits.length} permits total`);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            console.error(`[SunnyvaleExtractor] Error during scrape:`, error);
            return {
                permits: [],
                success: false,
                error: error.message || "Unknown error",
                scrapedAt: new Date(),
            };
        } finally {
            await this.cleanup();
        }
    }

    protected async parsePermitData(limit?: number): Promise<PermitData[]> {
        if (!this.page) {
            throw new Error("Page not initialized");
        }

        const permits: PermitData[] = [];

        // Find all permit result divs
        // Each permit is in a div with ng-repeat="record in vm.getEntityRecords()"
        const permitDivs = await this.page.$$('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');

        console.log(`[SunnyvaleExtractor] Found ${permitDivs.length} permit results on current page`);

        for (let i = 0; i < permitDivs.length; i++) {
            if (limit && permits.length >= limit) break;

            const permitDiv = permitDivs[i];

            try {
                // Extract permit number
                const permitNumberEl = await permitDiv.$('div[name="label-CaseNumber"] a, div[id*="entityRecord"] a[href*="permit"]');
                const permitNumber = permitNumberEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", permitNumberEl)
                    : undefined;

                if (!permitNumber) {
                    console.warn(`[SunnyvaleExtractor] Skipping permit without permit number`);
                    continue;
                }

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
                const status = this.normalizeStatus(statusText);

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

                // Extract issued date (optional)
                const issuedDateEl = await permitDiv.$('div[name="label-IssuedDate"] span, div[label*="Issued Date"] span');
                const issuedDateString = issuedDateEl
                    ? await this.page.evaluate((el) => el.textContent?.trim() || "", issuedDateEl)
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

                // Extract Valuation and Assigned To from detail page
                let value: number | undefined;
                let assignedTo: string | undefined;
                if (sourceUrl) {
                    try {
                        const detailData = await this.extractDetailPageData(sourceUrl);
                        value = detailData.value;
                        assignedTo = detailData.assignedTo;
                        if (value !== undefined) {
                            console.log(`[SunnyvaleExtractor] Extracted value $${value.toLocaleString()} for ${permitNumber}`);
                        }
                        if (assignedTo) {
                            console.log(`[SunnyvaleExtractor] Extracted Assigned To: ${assignedTo} for ${permitNumber}`);
                        }
                    } catch (error: any) {
                        console.warn(`[SunnyvaleExtractor] Could not extract detail data for ${permitNumber}: ${error.message}`);
                    }
                }

                const permit: PermitData = {
                    permitNumber,
                    title: permitType,
                    description,
                    address,
                    city: this.city,
                    state: this.state,
                    zipCode,
                    permitType,
                    status,
                    value,
                    appliedDate,
                    appliedDateString,
                    expirationDate,
                    sourceUrl,
                    licensedProfessionalText: assignedTo, // Store "Assigned To" value
                };

                if (this.validatePermitData(permit)) {
                    permits.push(permit);
                } else {
                    console.warn(`[SunnyvaleExtractor] Invalid permit data for ${permitNumber}`);
                }
            } catch (error: any) {
                console.warn(`[SunnyvaleExtractor] Error parsing permit ${i + 1}:`, error.message);
            }
        }

        return permits;
    }

    /**
     * Extract Valuation and Assigned To from permit detail page
     * Opens the detail page in a new tab, extracts the data, then closes the tab
     */
    private async extractDetailPageData(detailUrl: string): Promise<{ value?: number; assignedTo?: string }> {
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
            const baseUrl = 'https://sunnyvaleca-energovpub.tylerhost.net/apps/SelfService';
            if (detailUrl.startsWith('#')) {
                // Hash route: #/permit/xxx
                absoluteUrl = `${baseUrl}${detailUrl}`;
            } else if (detailUrl.startsWith('/')) {
                // Absolute path: /permit/xxx
                absoluteUrl = `${baseUrl}${detailUrl}`;
            } else {
                // Relative path: permit/xxx
                absoluteUrl = `${baseUrl}/${detailUrl}`;
            }
        }

        // Open detail page in a new tab
        const detailPage = await this.browser.newPage();
        try {
            console.log(`[SunnyvaleExtractor] Opening detail page: ${absoluteUrl}`);
            await detailPage.goto(absoluteUrl, { waitUntil: 'networkidle0', timeout: 30000 });
            
            // Wait for Angular to load
            await this.waitForAngular(detailPage);
            
            // Wait for the page to be fully rendered - sometimes valuation takes longer to appear
            await new Promise((resolve) => setTimeout(resolve, 3000));
            
            // Try to wait for valuation-related elements to appear
            try {
                await detailPage.waitForSelector('div[name*="Valuation"], div[label*="Valuation"], div[id*="Valuation"], label:has-text("Valuation"), *[ng-bind*="valuation"]', {
                    timeout: 5000
                }).catch(() => {
                    // It's okay if we don't find it, we'll try extraction anyway
                });
            } catch (e) {
                // Continue even if selector not found
            }
            
            // Give Angular a bit more time to populate values
            await this.waitForAngular(detailPage);
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Extract Valuation and Assigned To fields
            // Try multiple times with increasing wait times in case Angular is still loading
            let data: { value?: number; assignedTo?: string } = { value: undefined, assignedTo: undefined };
            const maxRetries = 3;
            
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                if (attempt > 0) {
                    console.log(`[SunnyvaleExtractor] Retry ${attempt + 1}/${maxRetries} for extracting valuation...`);
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await this.waitForAngular(detailPage);
                }
                
                data = await detailPage.evaluate(() => {
                let value: number | undefined;
                let assignedTo: string | undefined;

                // Try multiple selectors for Valuation and Assigned To fields
                // Look for labels and find the associated values
                // @ts-expect-error - page.evaluate runs in browser context
                const labels = Array.from(document.querySelectorAll('label, div[name*="label"]')) as Element[];
                
                for (const label of labels) {
                    const labelText = (label.textContent || '').toLowerCase().trim();
                    
                    // Extract Valuation
                    if (labelText.includes('valuation') && !labelText.includes('total') && !value) {
                        // Find the value element - could be in a sibling span, div, or input
                        const parent = label.parentElement;
                        if (parent) {
                            // Try to find value in various formats - search more broadly
                            const valueSelectors = [
                                'span',
                                'div[class*="value"]',
                                'input',
                                'tyler-highlight',
                                'div',
                                'span[class*="ng"]',
                                '*[ng-bind]',
                                '*[ng-model]'
                            ];
                            
                            for (const selector of valueSelectors) {
                                const valueEl = parent.querySelector(selector);
                                if (valueEl) {
                                    const valueText = (valueEl.textContent || (valueEl as any).value || (valueEl as any).innerText || '').trim();
                                    if (valueText && valueText !== labelText) {
                                        // Remove $ and commas, parse as number
                                        const cleaned = valueText.replace(/[$,]/g, '');
                                        const parsed = parseFloat(cleaned);
                                        if (!isNaN(parsed) && parsed > 0) {
                                            value = parsed;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // Also try finding by walking through all children
                            if (!value && parent.children.length > 0) {
                                for (let i = 0; i < parent.children.length; i++) {
                                    const child = parent.children[i];
                                    if (child !== label) {
                                        const childText = (child.textContent || (child as any).innerText || '').trim();
                                        const cleaned = childText.replace(/[$,]/g, '');
                                        const parsed = parseFloat(cleaned);
                                        if (!isNaN(parsed) && parsed > 0) {
                                            value = parsed;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Alternative: find next sibling with value
                        if (!value) {
                            let sibling = label.nextElementSibling;
                            let attempts = 0;
                            while (sibling && attempts < 10) {
                                const text = (sibling.textContent || (sibling as any).innerText || '').trim();
                                const cleaned = text.replace(/[$,]/g, '');
                                const parsed = parseFloat(cleaned);
                                if (!isNaN(parsed) && parsed > 0) {
                                    value = parsed;
                                    break;
                                }
                                sibling = sibling.nextElementSibling;
                                attempts++;
                            }
                        }
                        
                        // Also check parent's next sibling (common in form layouts)
                        if (!value && label.parentElement) {
                            const parentSibling = label.parentElement.nextElementSibling;
                            if (parentSibling) {
                                const text = (parentSibling.textContent || '').trim();
                                const cleaned = text.replace(/[$,]/g, '');
                                const parsed = parseFloat(cleaned);
                                if (!isNaN(parsed) && parsed > 0) {
                                    value = parsed;
                                }
                            }
                        }
                    }
                    
                    // Extract Assigned To
                    if (labelText.includes('assigned to') && !assignedTo) {
                        // Find the value element
                        const parent = label.parentElement;
                        if (parent) {
                            const valueEl = parent.querySelector('span, div, tyler-highlight, a');
                            if (valueEl) {
                                const valueText = (valueEl.textContent || '').trim();
                                if (valueText) {
                                    assignedTo = valueText;
                                }
                            }
                        }
                        
                        // Alternative: find next sibling with value
                        if (!assignedTo) {
                            let sibling = label.nextElementSibling;
                            while (sibling && !assignedTo) {
                                const text = (sibling.textContent || '').trim();
                                if (text) {
                                    assignedTo = text;
                                    break;
                                }
                                sibling = sibling.nextElementSibling;
                            }
                        }
                    }
                }
                
                // Fallback: search for div[name="label-Valuation"] or similar
                if (!value) {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const valuationDiv = document.querySelector('div[name*="Valuation"], div[label*="Valuation"], div[id*="Valuation"]');
                    if (valuationDiv) {
                        const parent = valuationDiv.parentElement;
                        if (parent) {
                            // Try multiple selectors
                            const selectors = ['span', 'div', 'input', 'tyler-highlight', '*[ng-bind]', '*[ng-model]'];
                            for (const selector of selectors) {
                                const valueEl = parent.querySelector(selector);
                                if (valueEl) {
                                    const valueText = (valueEl.textContent || (valueEl as any).value || (valueEl as any).innerText || '').trim();
                                    if (valueText) {
                                        const cleaned = valueText.replace(/[$,]/g, '');
                                        const parsed = parseFloat(cleaned);
                                        if (!isNaN(parsed) && parsed > 0) {
                                            value = parsed;
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            // If still not found, check all parent children
                            if (!value && parent.children.length > 0) {
                                for (let i = 0; i < parent.children.length; i++) {
                                    const child = parent.children[i];
                                    if (child !== valuationDiv) {
                                        const childText = (child.textContent || (child as any).innerText || '').trim();
                                        const cleaned = childText.replace(/[$,]/g, '');
                                        const parsed = parseFloat(cleaned);
                                        if (!isNaN(parsed) && parsed > 0) {
                                            value = parsed;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Final fallback: search entire document for text matching currency pattern near "valuation"
                if (!value) {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const allText = document.body.innerText || document.body.textContent || '';
                    const valuationRegex = /valuation[^$]*(\$[\d,]+)/i;
                    const match = valuationRegex.exec(allText);
                    if (match && match[1]) {
                        const cleaned = match[1].replace(/[$,]/g, '');
                        const parsed = parseFloat(cleaned);
                        if (!isNaN(parsed) && parsed > 0) {
                            value = parsed;
                        }
                    }
                }
                
                // Fallback: search for Assigned To
                if (!assignedTo) {
                    // @ts-expect-error - page.evaluate runs in browser context
                    const assignedToDiv = document.querySelector('div[name*="AssignedTo"], div[name*="Assigned"], div[label*="Assigned"], div[id*="Assigned"]');
                    if (assignedToDiv) {
                        const parent = assignedToDiv.parentElement;
                        if (parent) {
                            const valueEl = parent.querySelector('span, div, a, tyler-highlight');
                            if (valueEl) {
                                const valueText = (valueEl.textContent || '').trim();
                                if (valueText) {
                                    assignedTo = valueText;
                                }
                            }
                        }
                    }
                }
                
                return { value, assignedTo };
                });
                
                // If we found a value, stop retrying
                if (data.value !== undefined) {
                    break;
                }
            }

            // Debug: Log if value wasn't found for troubleshooting
            if (data.value === undefined) {
                console.warn(`[SunnyvaleExtractor] Could not extract valuation from detail page after ${maxRetries} attempts. URL: ${absoluteUrl}`);
            }
            
            return data;
        } catch (error: any) {
            console.warn(`[SunnyvaleExtractor] Error extracting detail data from ${absoluteUrl}: ${error.message}`);
            return { value: undefined, assignedTo: undefined };
        } finally {
            // Close the detail page tab
            await detailPage.close();
        }
    }

    private async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

