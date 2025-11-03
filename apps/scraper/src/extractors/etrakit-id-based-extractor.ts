/**
 * Base extractor for ID-based eTRAKiT scrapers
 * These scrapers search by permit number and click into detail pages
 * (instead of downloading Excel files like daily eTRAKiT scrapers)
 */

import { BaseExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";

export abstract class EtrakitIdBasedExtractor extends BaseExtractor {
    protected browser: Browser | null = null;
    protected page: Page | null = null;

    /**
     * Format date for eTRAKiT system (MM/DD/YYYY)
     */
    protected formatDateForETRAKiT(date: Date): string {
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const yyyy = String(date.getFullYear());
        return `${mm}/${dd}/${yyyy}`;
    }

    /**
     * Set dropdown value by finding the option text
     */
    protected async setDropdownValue(selector: string, value: string): Promise<boolean> {
        return await this.page!.evaluate((sel: string, val: string) => {
            const select = (globalThis as any).document.querySelector(sel) as any;
            if (!select) return false;
            
            // Try to find option by text content or value
            const options = Array.from(select.options) as any[];
            const option = options.find((opt: any) => {
                const optText = (opt.text || '').trim();
                const optValue = (opt.value || '').trim();
                const searchVal = val.trim();
                return optText === searchVal || 
                       optValue === searchVal ||
                       optText.toUpperCase() === searchVal.toUpperCase() ||
                       optValue.toUpperCase() === searchVal.toUpperCase() ||
                       optText.toUpperCase().includes(searchVal.toUpperCase());
            });
            
            if (option) {
                select.value = option.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                // Also trigger onchange if it exists
                if (select.onchange) {
                    select.onchange(new Event("change") as any);
                }
                return true;
            }
            return false;
        }, selector, value);
    }

    /**
     * Set input field value
     */
    protected async setInputValue(selector: string, value: string): Promise<boolean> {
        return await this.page!.evaluate((sel, val) => {
            const input = (globalThis as any).document.querySelector(sel);
            if (!input) return false;
            
            input.value = val;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        }, selector, value);
    }

    /**
     * Initialize browser
     */
    protected async initializeBrowser(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
    }

    /**
     * Navigate to search page
     */
    protected async navigateToSearchPage(): Promise<void> {
        if (!this.page) {
            throw new Error("Page not initialized");
        }

        await this.page.goto(this.url, {
            waitUntil: "networkidle2",
            timeout: 60000,
        });
        console.log(`[${this.getName()}] Page loaded`);
    }

    /**
     * Set search filters for eTRAKiT
     */
    protected async setSearchFilters(
        searchBySelector: string,
        searchByValue: string,
        searchOperatorSelector: string,
        searchOperatorValue: string,
        searchValueSelector: string,
        searchValue: string
    ): Promise<void> {
        console.log(`[${this.getName()}] Setting up filters...`);

        // Wait for page to be interactive
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Set "Search By" dropdown
        const currentSearchBy = await this.page!.evaluate((sel: string) => {
            const select = (globalThis as any).document.querySelector(sel) as any;
            if (!select) return null;
            const selected = select.options[select.selectedIndex];
            return selected ? selected.text.trim() : null;
        }, searchBySelector);

        if (currentSearchBy !== searchByValue) {
            console.log(`[${this.getName()}] Setting SearchBy from "${currentSearchBy}" to "${searchByValue}" (this will trigger postback)`);
            const searchBySet = await this.setDropdownValue(searchBySelector, searchByValue);
            if (!searchBySet) {
                throw new Error(`Could not set SearchBy dropdown to "${searchByValue}"`);
            }
            // Wait for postback to complete after changing SearchBy
            await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
            console.log(`[${this.getName()}] SearchBy already set to ${searchByValue} (skipping)`);
        }

        // Set "Search Operator" dropdown
        const operatorSet = await this.setDropdownValue(searchOperatorSelector, searchOperatorValue);
        if (!operatorSet) {
            // Try fallback with text match
            const operatorSet2 = await this.page!.evaluate((sel: string, val: string) => {
                const select = (globalThis as any).document.querySelector(sel) as any;
                if (!select) return false;
                const options = Array.from(select.options) as any[];
                const option = options.find((opt: any) => opt.value === val || opt.text?.includes(val));
                if (option) {
                    select.value = option.value;
                    select.dispatchEvent(new Event("change", { bubbles: true }));
                    return true;
                }
                return false;
            }, searchOperatorSelector, searchOperatorValue);
            if (!operatorSet2) {
                throw new Error(`Could not set SearchOperator dropdown to "${searchOperatorValue}"`);
            }
            console.log(`[${this.getName()}] SearchOperator set to ${searchOperatorValue} (via fallback)`);
        } else {
            console.log(`[${this.getName()}] SearchOperator set to ${searchOperatorValue}`);
        }

        // Set "Search Value" input field
        const valueSet = await this.setInputValue(searchValueSelector, searchValue);
        if (!valueSet) {
            throw new Error(`Could not set SearchValue input to "${searchValue}"`);
        }
        console.log(`[${this.getName()}] SearchValue set to: ${searchValue}`);
    }

    /**
     * Execute search and wait for results
     */
    protected async executeSearch(searchButtonSelector: string): Promise<void> {
        console.log(`[${this.getName()}] Filters set, clicking search...`);

        // Click search button
        const searchButton = await this.page!.$ (searchButtonSelector);
        if (!searchButton) {
            throw new Error(`Could not find search button with selector '${searchButtonSelector}'`);
        }

        await searchButton.click();
        console.log(`[${this.getName()}] Search button clicked, waiting for postback...`);

        // Wait for postback to complete - look for results to appear
        try {
            await this.page!.waitForFunction(
                () => {
                    const lbl = (globalThis as any).document.querySelector('#cplMain_lblMoreResults, #ctl00_cplMain_lblMoreResults');
                    const table = (globalThis as any).document.querySelector('table tbody tr');
                    return (lbl && lbl.textContent && lbl.textContent.includes('record')) || table;
                },
                { timeout: 30000 }
            );
            console.log(`[${this.getName()}] Postback complete, results visible`);
        } catch (e) {
            console.warn(`[${this.getName()}] Timeout waiting for postback, continuing...`);
        }

        // Wait for results to load
        console.log(`[${this.getName()}] Waiting for search results...`);
        try {
            await this.page!.waitForSelector('#cplMain_lblMoreResults, #ctl00_cplMain_lblMoreResults, table tbody tr', {
                timeout: 15000,
            });
            console.log(`[${this.getName()}] Results loaded`);
        } catch (e) {
            console.warn(`[${this.getName()}] Timeout waiting for results, continuing anyway...`);
        }

        // Additional wait for page to stabilize after postback
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    /**
     * Get the count of search results from the results page
     * Counts actual visible permit rows (tr.rgRow and tr.rgAltRow), not the label which may show pagination totals
     */
    protected async getResultCount(): Promise<number> {
        try {
            const count = await this.page!.evaluate(() => {
                // Count both rgRow and rgAltRow (eTRAKiT uses alternating row classes)
                // This is more reliable than reading the label which may show pagination totals
                const rows = (globalThis as any).document.querySelectorAll('tr.rgRow, tr.rgAltRow');
                const visibleCount = rows ? rows.length : 0;
                
                // If we got a count from rows, use it
                if (visibleCount > 0) {
                    return visibleCount;
                }
                
                // Fallback: try to read from label if no rows found (maybe page hasn't loaded yet)
                const lblMoreResults = (globalThis as any).document.querySelector('#cplMain_lblMoreResults, #ctl00_cplMain_lblMoreResults');
                if (lblMoreResults && lblMoreResults.textContent) {
                    const text = lblMoreResults.textContent.trim();
                    // Extract number from text like "Showing 1 to 5 of 100 records"
                    const match = text.match(/of\s+(\d+)/i);
                    if (match && match[1]) {
                        return parseInt(match[1], 10);
                    }
                }
                
                return 0;
            });

            return count || 0;
        } catch (e) {
            // If we can't get the count, assume we got some results
            return 0;
        }
    }

    /**
     * Get all permit rows from the current results page
     */
    protected async getPermitRows(): Promise<any[]> {
        return await this.page!.evaluate(() => {
            // Get both rgRow and rgAltRow (eTRAKiT uses alternating row classes)
            const rows = (globalThis as any).document.querySelectorAll('tr.rgRow, tr.rgAltRow');
            return Array.from(rows).map((row: any) => {
                const cells = row.querySelectorAll('td');
                if (cells.length === 0) return null;
                
                // First column has the permit number
                const permitNumberCell = cells[0];
                const permitNumber = permitNumberCell ? permitNumberCell.textContent?.trim() : null;
                
                return {
                    permitNumber,
                    link: null, // Rows are clickable, not links
                    rowIndex: Array.from(row.parentElement.children).indexOf(row),
                };
            }).filter((row: any) => row !== null && row.permitNumber);
        });
    }

    /**
     * Click into a permit detail page by clicking on the first <td> element in the row
     */
    protected async clickPermitRow(permitNumber: string): Promise<boolean> {
        try {
            // Find the first <td> element containing the permit number and click it
            // This is what we need to click, not the entire row
            const allCells = await this.page!.$$('tr.rgRow td:first-child, tr.rgAltRow td:first-child');
            for (const cell of allCells) {
                const text = await this.page!.evaluate((el: any) => el.textContent?.trim() || '', cell);
                if (text === permitNumber) {
                    // Click on the <td> element directly
                    await cell.click();
                    
                    // Wait for detail page to load
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    try {
                        await this.page!.waitForSelector('#cplMain_ctl02_lblPermitType, .rtsUL, table', { timeout: 15000 });
                    } catch (e) {
                        console.warn(`[${this.getName()}] Timeout waiting for detail page for ${permitNumber}`);
                    }
                    
                    return true;
                }
            }
            
            console.warn(`[${this.getName()}] Could not find cell for permit ${permitNumber}`);
            return false;
        } catch (e: any) {
            console.warn(`[${this.getName()}] Error clicking cell for ${permitNumber}: ${e?.message || e}`);
            return false;
        }
    }

    /**
     * Extract data from the Permit Info tab
     * Default implementation tries to extract common fields from tables
     * Subclasses can override for city-specific element IDs or structure
     */
    protected async extractPermitInfoTab(): Promise<Partial<PermitData>> {
        const data = await this.page!.evaluate(() => {
            const result: any = {};
            
            // Try to extract from tables - common eTRAKiT pattern
            const tables = (globalThis as any).document.querySelectorAll('table');
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const label = cells[0]?.textContent?.trim();
                        const value = cells[1]?.textContent?.trim();
                        
                        if (label && value) {
                            // Map common labels to fields
                            const labelUpper = label.toUpperCase();
                            if (labelUpper.includes('DESCRIPTION') || labelUpper.includes('WORK DESC')) {
                                result.description = value;
                            } else if (labelUpper === 'STATUS') {
                                result.status = value;
                            } else if (labelUpper.includes('APPLIED DATE')) {
                                result.appliedDate = value;
                            } else if (labelUpper.includes('APPROVED DATE')) {
                                result.approvedDate = value;
                            } else if (labelUpper.includes('ISSUED DATE')) {
                                result.issuedDate = value;
                            } else if (labelUpper.includes('FINALED DATE') || labelUpper.includes('FINAL DATE')) {
                                result.finaledDate = value;
                            } else if (labelUpper.includes('EXPIRATION DATE')) {
                                result.expirationDate = value;
                            } else if (labelUpper.includes('VALUATION') || labelUpper.includes('VALUE')) {
                                const match = value.match(/[\d,]+\.?\d*/);
                                if (match) {
                                    result.value = parseFloat(match[0].replace(/,/g, ''));
                                }
                            }
                        }
                    }
                }
            }
            
            return result;
        });
        
        return data;
    }

    /**
     * Extract data from the Contacts tab (for contractor information)
     * Default implementation searches tables for contractor-related labels
     * Subclasses can override for city-specific structure
     */
    protected async extractContactsTab(): Promise<Partial<PermitData>> {
        const contractorInfo = await this.page!.evaluate(() => {
            // Look for contractor information in the Contacts tab
            const tables = (globalThis as any).document.querySelectorAll('table');
            let contractor = null;
            let applicant = null;
            
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const label = cells[0]?.textContent?.trim();
                        const value = cells[1]?.textContent?.trim();
                        
                        if (label && value) {
                            const labelUpper = label.toUpperCase();
                            // Look for contractor-related labels
                            if ((labelUpper.includes('CONTRACTOR') || labelUpper.includes('LICENSE') || labelUpper.includes('PROFESSIONAL')) && !contractor) {
                                contractor = value;
                            }
                            // Also look for applicant
                            if (labelUpper.includes('APPLICANT') && !applicant) {
                                applicant = value;
                            }
                        }
                    }
                }
            }
            
            return { contractor, applicant };
        });
        
        return {
            licensedProfessionalText: contractorInfo.contractor || contractorInfo.applicant || undefined,
        };
    }

    /**
     * Extract data from the Site Info tab (for address information)
     * Default implementation searches tables for address-related labels
     * Subclasses can override for city-specific structure
     */
    protected async extractSiteInfoTab(): Promise<Partial<PermitData>> {
        const addressData = await this.page!.evaluate(() => {
            // Look for address in Site Info tab
            const tables = (globalThis as any).document.querySelectorAll('table');
            let address = null;
            let zipCode = null;
            
            for (const table of tables) {
                const rows = table.querySelectorAll('tr');
                for (const row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const label = cells[0]?.textContent?.trim();
                        const value = cells[1]?.textContent?.trim();
                        
                        if (label && value) {
                            const labelUpper = label.toUpperCase();
                            if ((labelUpper.includes('ADDRESS') || labelUpper.includes('SITE')) && !address) {
                                address = value;
                                // Extract ZIP code
                                const zipMatch = value.match(/\b(\d{5})\b/);
                                if (zipMatch) {
                                    zipCode = zipMatch[1];
                                }
                            }
                        }
                    }
                }
                if (address) break;
            }
            
            return { address, zipCode };
        });

        return {
            address: addressData.address || undefined,
            zipCode: addressData.zipCode || undefined,
        };
    }

    /**
     * Click on a specific tab by name (e.g., "Contacts", "Site Info")
     */
    protected async clickTab(tabName: string): Promise<boolean> {
        try {
            // Find the tab selector using evaluate, then click using Puppeteer's native click
            const tabSelector = await this.page!.evaluate((name: string) => {
                // Find the tab link
                const tabs = Array.from((globalThis as any).document.querySelectorAll('.rtsLI a.rtsLink')) as any[];
                const tab = tabs.find((t: any) => t.textContent?.trim().toUpperCase().includes(name.toUpperCase()));
                
                if (tab) {
                    // Return the tab's href or index
                    const href = tab.getAttribute('href');
                    if (href) {
                        // Escape special characters in href for CSS selector
                        const escapedHref = href.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
                        return `a.rtsLink[href="${escapedHref}"]`;
                    }
                    // Return a selector based on index
                    const tabIndex = Array.from(tab.parentElement?.querySelectorAll('a.rtsLink') || []).indexOf(tab);
                    if (tabIndex >= 0) {
                        return `.rtsLI:nth-child(${tabIndex + 1}) a.rtsLink`;
                    }
                }
                return null;
            }, tabName);

            if (!tabSelector) {
                return false;
            }

            // Try to find the tab by href first, then by text content
            let tabElement = await this.page!.$(tabSelector);
            
            // If href-based selector didn't work, try finding by text
            if (!tabElement) {
                const tabs = await this.page!.$$('.rtsLI a.rtsLink');
                for (const tab of tabs) {
                    const text = await this.page!.evaluate((el: any) => el.textContent?.trim() || '', tab);
                    if (text.toUpperCase().includes(tabName.toUpperCase())) {
                        tabElement = tab;
                        break;
                    }
                }
            }

            if (!tabElement) {
                return false;
            }

            // Use Puppeteer's native click (runs in proper page context)
            await tabElement.click();
            
            // Wait for tab content to load
            await new Promise((resolve) => setTimeout(resolve, 1500));
            
            return true;
        } catch (e: any) {
            console.warn(`[${this.getName()}] Error clicking tab ${tabName}: ${e?.message || e}`);
            return false;
        }
    }

    /**
     * Extract permit detail from detail page
     * This orchestrates the tab navigation and extraction
     */
    protected async extractPermitDetail(permitNumber: string): Promise<PermitData | null> {
        // Start with basic permit data
        const permitData: Partial<PermitData> = {
            permitNumber,
            city: this.city,
            state: this.state,
            sourceUrl: this.url,
        };

        try {
            // Click on the permit row to navigate to detail page
            const clicked = await this.clickPermitRow(permitNumber);
            if (!clicked) {
                console.warn(`[${this.getName()}] Could not find permit row for ${permitNumber}`);
                return null;
            }

            // Verify we're on the detail page by checking for expected elements
            try {
                await this.page!.waitForSelector('#cplMain_ctl02_lblPermitType, #cplMain_ctl02_lblPermitStatus', { timeout: 5000 });
            } catch (e) {
                console.warn(`[${this.getName()}] Detail page may not have loaded for ${permitNumber}`);
            }

            // Extract from Permit Info tab (default tab)
            const permitInfo = await this.extractPermitInfoTab();
            Object.assign(permitData, permitInfo);

            // Extract from Contacts tab
            const contactsClicked = await this.clickTab('Contacts');
            if (contactsClicked) {
                const contactsInfo = await this.extractContactsTab();
                Object.assign(permitData, contactsInfo);
            }

            // Extract from Site Info tab
            const siteInfoClicked = await this.clickTab('Site Info');
            if (siteInfoClicked) {
                const siteInfo = await this.extractSiteInfoTab();
                Object.assign(permitData, siteInfo);
            }
        } catch (e: any) {
            // Re-throw with more context
            throw new Error(`Error during extraction steps for ${permitNumber}: ${e?.message || e}`);
        }

        // Validate we have at least a permit number
        if (!permitData.permitNumber) {
            return null;
        }

        // Parse dates
        let appliedDate: Date | undefined;
        let appliedDateString: string | undefined;
        let expirationDate: Date | undefined;

        // Use Applied Date if available, otherwise try Approved Date or Issued Date
        const dateToUse = (permitData as any).appliedDate || (permitData as any).approvedDate || (permitData as any).issuedDate;
        if (dateToUse) {
            appliedDateString = dateToUse;
            appliedDate = this.parseDate(dateToUse);
        }

        if ((permitData as any).expirationDate) {
            expirationDate = this.parseDate((permitData as any).expirationDate);
        }

        // Normalize status if present
        let status: string | undefined = permitData.status;
        if (status) {
            // Subclasses should handle status normalization in their extractPermitInfoTab method
            // Base class just passes it through
        }

        return {
            permitNumber: permitData.permitNumber,
            title: permitData.title || undefined,
            description: permitData.description || undefined,
            address: permitData.address || undefined,
            city: permitData.city!,
            state: permitData.state!,
            zipCode: permitData.zipCode || undefined,
            status: status || undefined,
            value: permitData.value,
            appliedDate,
            appliedDateString,
            expirationDate,
            sourceUrl: permitData.sourceUrl || this.url,
            licensedProfessionalText: permitData.licensedProfessionalText || undefined,
        };
    }

    /**
     * Required by base class - not used for ID-based scrapers
     */
    protected async parsePermitData(rawData: any, limit?: number): Promise<PermitData[]> {
        // ID-based scrapers don't use this method
        return [];
    }

    /**
     * Navigate through pagination and extract permits
     */
    protected async navigatePagesAndExtract(limit?: number): Promise<PermitData[]> {
        const allPermits: PermitData[] = [];
        let pageNum = 1;
        const maxPages = 20; // eTRAKiT typically limits to 20 pages

        while (pageNum <= maxPages) {
            console.log(`[${this.getName()}] Processing page ${pageNum}...`);

            // Get all permit rows on current page
            const rows = await this.getPermitRows();
            
            if (rows.length === 0) {
                console.log(`[${this.getName()}] No more rows found on page ${pageNum}`);
                break;
            }

            // Process each permit on this page
            for (const row of rows) {
                if (limit && allPermits.length >= limit) {
                    console.log(`[${this.getName()}] Reached limit of ${limit} permits`);
                    return allPermits;
                }

                if (!row.permitNumber) {
                    continue;
                }

                console.log(`[${this.getName()}] Extracting permit: ${row.permitNumber}`);

                // Click into the permit detail page
                try {
                    const permitData = await this.extractPermitDetail(row.permitNumber);
                    if (permitData) {
                        allPermits.push(permitData);
                        console.log(`[${this.getName()}] Extracted permit ${row.permitNumber}`);
                    }
                } catch (e: any) {
                    console.warn(`[${this.getName()}] Error extracting permit ${row.permitNumber}: ${e?.message || e}`);
                }

                // Navigate back to search results
                await this.navigateBackToResults();
            }

            // Check if there's a next page
            const hasNextPage = await this.page!.evaluate(() => {
                // Look for next page button/link
                const nextBtn = (globalThis as any).document.querySelector('a[href*="Page$Next"], input[value*="Next"]');
                return nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled');
            });

            if (!hasNextPage) {
                console.log(`[${this.getName()}] No more pages`);
                break;
            }

            // Click next page
            await this.page!.evaluate(() => {
                const nextBtn = (globalThis as any).document.querySelector('a[href*="Page$Next"], input[value*="Next"]') as any;
                if (nextBtn) {
                    nextBtn.click();
                }
            });

            await new Promise((resolve) => setTimeout(resolve, 3000));
            pageNum++;
        }

        return allPermits;
    }

    /**
     * Navigate back to search results from a detail page
     */
    protected async navigateBackToResults(): Promise<void> {
        // Look for "Return to Search Results" link (specific to Milpitas)
        // Try multiple valid CSS selectors
        let backLink = await this.page!.$('#cplMain_hlSearchResults');
        
        if (!backLink) {
            // Try finding by href attribute and text content
            const links = await this.page!.$$('a[href*="SearchResults"]');
            for (const link of links) {
                const text = await this.page!.evaluate((el: any) => el.textContent?.trim() || '', link);
                if (text.includes('Search Results') || text.includes('Return')) {
                    backLink = link;
                    break;
                }
            }
        }
        
        if (backLink) {
            await backLink.click();
            await new Promise((resolve) => setTimeout(resolve, 2000));
            // Wait for results table to appear
            await this.page!.waitForSelector('tr.rgRow, tr.rgAltRow, table tbody tr', { timeout: 10000 }).catch(() => {
                console.warn(`[${this.getName()}] Timeout waiting for results table after navigating back`);
            });
        } else {
            // Fallback: go back to search URL
            await this.page!.goto(this.url, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    /**
     * Parse date string (MM/DD/YYYY format) or Excel date serial number
     */
    protected parseDate(dateStr: string | number | null): Date | undefined {
        if (!dateStr) return undefined;
        
        if (typeof dateStr === 'number') {
            if (dateStr > 0 && dateStr < 73000) {
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                const date = new Date(excelEpoch.getTime() + dateStr * millisecondsPerDay);
                if (date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
                    return date;
                }
            }
            return undefined;
        }
        
        const str = dateStr.toString().trim();
        if (!str) return undefined;
        
        // Handle MM/DD/YYYY format
        const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (match) {
            const month = parseInt(match[1]);
            const day = parseInt(match[2]);
            let year = parseInt(match[3]);
            
            if (year < 100) {
                year += year < 50 ? 2000 : 1900;
            }
            
            if (year < 1900 || year >= 2100) {
                return undefined;
            }
            
            if (month < 1 || month > 12 || day < 1 || day > 31) {
                return undefined;
            }
            
            return new Date(year, month - 1, day);
        }
        
        return undefined;
    }

    /**
     * Clean up resources
     */
    protected async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.page = null;
    }
}

