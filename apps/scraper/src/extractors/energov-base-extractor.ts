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
     * Default scrape implementation for Energov-based extractors
     * Can be overridden by subclasses if needed
     */
    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
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
            await this.setupSearchFilters(this.page, startDateStr, endDateStr);

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
            await detailPage.goto(absoluteUrl, {
                waitUntil: "networkidle2",
                timeout: 30000,
            });

            // Wait for AngularJS to be ready
            await this.waitForAngular(detailPage);

            // Extract Valuation
            let value: number | undefined;
            const maxRetries = 3;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    // Wait for Valuation field to appear
                    await detailPage.waitForSelector(
                        'div[name="label-Valuation"] span, div[label*="Valuation"] span, input[name*="Valuation"]',
                        { timeout: 5000 }
                    );

                    value = await detailPage.evaluate(() => {
                        // Try multiple selectors for Valuation
                        const selectors = [
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
                                if (text) {
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
                        break; // Success, exit retry loop
                    }
                } catch (e) {
                    if (attempt < maxRetries - 1) {
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    }
                }
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
                }
                } catch (e) {
                    // Ignore errors extracting Contractor License
                }
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

        const permits: PermitData[] = [];

        // Find all permit result divs
        // Each permit is in a div with ng-repeat="record in vm.getEntityRecords()"
        const permitDivs = await this.page.$$('div[name="label-SearchResult"][ng-repeat*="record"], div[ng-repeat*="getEntityRecords"]');

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

                // Extract Valuation and Contractor License from detail page
                let value: number | undefined;
                let contractorLicense: string | undefined;
                if (sourceUrl) {
                    try {
                        const detailData = await this.extractDetailPageData(sourceUrl);
                        value = detailData.value;
                        contractorLicense = detailData.contractorLicense;
                    } catch (error: any) {
                        // Ignore errors extracting detail data
                    }
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
                }
            } catch (error: any) {
                // Continue on error for individual permits
            }
        }

        return permits;
    }

    /**
     * Navigate through pagination if needed
     */
    protected async navigatePages(page: Page, limit?: number): Promise<PermitData[]> {
        const allPermits: PermitData[] = [];
        let pageNum = 1;

        while (true) {
            const permits = await this.parsePermitData(limit ? limit - allPermits.length : undefined);
            allPermits.push(...permits);

            if (limit && allPermits.length >= limit) {
                break;
            }

            // Check if there's a next page
            // Try multiple pagination patterns: Energov-specific (#link-NextPage) and generic AngularJS patterns
            const hasNextPage = await page.evaluate(() => {
                // Try Energov-specific pagination (Sunnyvale, Gilroy, etc.)
                const nextBtnEnergov = (globalThis as any).document.getElementById('link-NextPage');
                if (nextBtnEnergov) {
                    // Check if the parent <li> has 'disabled' class
                    const parentLi = nextBtnEnergov.closest('li');
                    return parentLi && !parentLi.classList.contains('disabled');
                }
                
                // Fallback to AngularJS patterns
                const nextBtn = (globalThis as any).document.querySelector('button[ng-click*="next"], a[ng-click*="next"]');
                if (nextBtn) {
                    return !(nextBtn as any).disabled && !(nextBtn as any).classList.contains('disabled');
                }
                
                return false;
            });

            if (!hasNextPage) {
                break;
            }

            // Navigate to next page
            const clicked = await page.evaluate(() => {
                // Try Energov-specific pagination first
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
                
                // Fallback to generic AngularJS patterns
                const nextBtn = (globalThis as any).document.querySelector('button[ng-click*="next"], a[ng-click*="next"]');
                if (nextBtn) {
                    const angular = (globalThis as any).window.angular;
                    if (angular) {
                        const element = angular.element(nextBtn);
                        const scope = element.scope();
                        if (scope && scope.vm && scope.vm.nextPage) {
                            scope.$apply(() => {
                                scope.vm.nextPage();
                            });
                        }
                    }
                    nextBtn.click();
                    return true;
                }
                
                return false;
            });
            
            if (!clicked) {
                console.warn(`[${this.constructor.name}] Could not find or click next page button`);
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.waitForAngular(page);
            pageNum++;
        }

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

