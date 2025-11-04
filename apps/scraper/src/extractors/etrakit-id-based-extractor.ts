/**
 * Base extractor for ID-based eTRAKiT scrapers
 * These scrapers search by permit number and click into detail pages
 * (instead of downloading Excel files like daily eTRAKiT scrapers)
 */

import { BaseExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";

/**
 * Configuration interface for ID-based eTRAKiT extractors
 * Child classes provide this configuration to customize behavior
 */
export interface EtrakitIdBasedConfig {
    /**
     * Base permit prefixes without year suffix (e.g., ["B-AC", "B-AM"] for Milpitas)
     */
    basePrefixes: string[];
    
    /**
     * Number of digits for year suffix: 2 for "25", 4 for "2025"
     */
    yearSuffixDigits: 2 | 4;
    
    /**
     * Maximum results per batch (determines when to move to next batch)
     */
    maxResultsPerBatch: number;
    
    /**
     * Number of digits for batch suffixes (pagestart)
     * Milpitas: 2 digits, Morgan Hill: 3 digits, Los Altos: 4 digits
     */
    suffixDigits: number;
    
    /**
     * Search filter configuration
     */
    searchByValue: string;  // e.g., "Permit Number" or "Permit#"
    searchOperatorValue: string;  // e.g., "BEGINS WITH"
    
    /**
     * Search button selector(s) - can be comma-separated for multiple fallbacks
     */
    searchButtonSelector: string;
    
    /**
     * Element ID prefix for Permit Info tab (e.g., "ctl02" or "ctl07")
     * Used to build selectors like cplMain_ctl02_lblPermitDesc
     */
    permitInfoTabIdPrefix: string;
    
    /**
     * Whether to extract title from Permit Info tab
     * Some cities use "Short Description" for title, others leave it blank
     */
    extractTitle: boolean;
    
    /**
     * Description field selector suffix
     * If set, description comes from cplMain_{prefix}_lblPermitNotes (e.g., "Notes" field)
     * If not set, description comes from cplMain_{prefix}_lblPermitDesc (same as title field)
     */
    descriptionFieldSuffix?: string;  // e.g., "lblPermitNotes" for Milpitas, undefined for others
    
    /**
     * Element ID prefix for Site Info tab (e.g., "ctl03" or "ctl08")
     */
    siteInfoTabIdPrefix: string;
    
    /**
     * Whether Contacts tab exists and should be extracted
     */
    hasContactsTab: boolean;
    
    /**
     * Pagination configuration
     */
    paginationConfig: {
        maxPages: number;
        /**
         * Selector for next page button (e.g., "input.PagerButton.NextPage")
         */
        nextPageSelector: string;
        /**
         * Wait time after clicking next page (ms)
         */
        waitAfterPageClick?: number;
    };
}

export abstract class EtrakitIdBasedExtractor extends BaseExtractor {
    protected browser: Browser | null = null;
    protected page: Page | null = null;
    
    /**
     * Starting batch numbers for each prefix (for incremental scraping)
     * Set by scraper.ts before calling scrape()
     */
    protected startingBatchNumbers: Map<string, number> = new Map();

    /**
     * Get configuration for this extractor
     * Child classes must provide this
     */
    protected abstract getConfig(): EtrakitIdBasedConfig;
    
    /**
     * Get permit prefixes for a given date (used for incremental scraping)
     * Default implementation uses config, but can be overridden if needed
     */
    protected getPermitPrefixes(startDate?: Date): string[] {
        const config = this.getConfig();
        const year = startDate ? startDate.getFullYear() : new Date().getFullYear();
        const yearSuffix = config.yearSuffixDigits === 2 
            ? String(year).slice(-2) 
            : String(year);
        return config.basePrefixes.map(prefix => `${prefix}${yearSuffix}`);
    }

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
            // Wait longer to ensure page reloads completely
            await new Promise((resolve) => setTimeout(resolve, 4000));
            // Wait for search button to appear after postback
            try {
                await this.page!.waitForSelector('#cplMain_btnSearch, #ctl00_cplMain_btnSearch', { timeout: 10000 });
            } catch (e) {
                console.warn(`[${this.getName()}] Search button not found after postback, continuing...`);
            }
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

        // Click search button - handle multiple selectors separated by comma
        const selectors = searchButtonSelector.split(',').map(s => s.trim());
        let searchButton = null;
        for (const selector of selectors) {
            searchButton = await this.page!.$ (selector);
            if (searchButton) break;
        }
        if (!searchButton) {
            throw new Error(`Could not find search button with selectors '${searchButtonSelector}'`);
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
     * Also extracts contractor info if available in the table
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
                
                // Look for contractor information in other columns
                // Common column names/patterns: Contractor, Contractor Name, License, Professional
                let contractor: string | null = null;
                
                // Try to find a header row to identify which column has contractor info
                const table = row.closest('table');
                let headerRow: any = null;
                if (table) {
                    // Look for header row (usually has th elements or specific classes)
                    headerRow = table.querySelector('thead tr, tr.rgHeaderRow, tr.rgHeader');
                }
                
                // If we have headers, use them to find contractor column
                if (headerRow) {
                    const headerCells = headerRow.querySelectorAll('th, td');
                    headerCells.forEach((headerCell: any, index: number) => {
                        if (index < cells.length && !contractor) {
                            const headerText = headerCell.textContent?.trim().toUpperCase() || '';
                            // Check if this column header mentions contractor
                            if (headerText.includes('CONTRACTOR') || 
                                headerText.includes('LICENSE') || 
                                headerText.includes('PROFESSIONAL') ||
                                headerText.includes('APPLICANT')) {
                                const cellText = cells[index]?.textContent?.trim();
                                if (cellText && cellText.length > 0) {
                                    contractor = cellText;
                                }
                            }
                        }
                    });
                }
                
                // If we didn't find contractor via headers, try common column positions
                // Many eTRAKiT tables have: Permit #, Description/Type, Status, Contractor (often 3rd or 4th column)
                if (!contractor && cells.length >= 3) {
                    // Try columns 2, 3, 4 as potential contractor columns
                    for (let i = 2; i < Math.min(cells.length, 5); i++) {
                        const cellText = cells[i]?.textContent?.trim();
                        if (cellText && cellText.length > 3) {
                            // Heuristic: if the text looks like a company/person name (not a date, status, or number)
                            // and it's longer than 3 chars, it might be a contractor
                            if (!cellText.match(/^\d+$/) && // Not just numbers
                                !cellText.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) && // Not a date
                                !cellText.match(/^(ISSUED|APPROVED|IN REVIEW|FINALED|APPLIED|PENDING)/i) && // Not a status
                                cellText.length > 5) { // Reasonable length for a name
                                // This could be contractor - but let's be more selective
                                // Look for common business suffixes or patterns
                                if (cellText.match(/\b(Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co|Contractor|Contractors)\b/i) ||
                                    cellText.match(/^[A-Z][a-z]+/)) { // Starts with capital letter
                                    contractor = cellText;
                                    break;
                                }
                            }
                        }
                    }
                }
                
                return {
                    permitNumber,
                    contractor: contractor || undefined,
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
     * Uses configurable element IDs from getConfig()
     */
    protected async extractPermitInfoTab(): Promise<Partial<PermitData>> {
        const config = this.getConfig();
        const prefix = config.permitInfoTabIdPrefix;
        
        // Use Puppeteer's native methods instead of page.evaluate to avoid triggering page JavaScript
        const getSpanText = async (id: string): Promise<string | null> => {
            try {
                const element = await this.page!.$(`#${id}`);
                if (element) {
                    const text = await this.page!.evaluate((el: any) => el.textContent?.trim() || '', element);
                    return text || null;
                }
            } catch (e) {
                // Ignore errors
            }
            return null;
        };

        const data: any = {};
        
        // Extract title if configured (e.g., "Short Description" for Milpitas)
        if (config.extractTitle) {
            data.title = await getSpanText(`cplMain_${prefix}_lblPermitDesc`);
        }
        
        // Extract description
        // If descriptionFieldSuffix is set, use it (e.g., "lblPermitNotes" for Milpitas)
        // Otherwise, use the same field as title (e.g., "lblPermitDesc" for Morgan Hill/Los Altos)
        const descFieldSuffix = config.descriptionFieldSuffix || 'lblPermitDesc';
        data.description = await getSpanText(`cplMain_${prefix}_${descFieldSuffix}`);
        
        // Extract status
        data.status = await getSpanText(`cplMain_${prefix}_lblPermitStatus`);
        
        // Extract dates
        data.appliedDate = await getSpanText(`cplMain_${prefix}_lblPermitAppliedDate`);
        data.approvedDate = await getSpanText(`cplMain_${prefix}_lblPermitApprovedDate`);
        data.issuedDate = await getSpanText(`cplMain_${prefix}_lblPermitIssuedDate`);
        data.finaledDate = await getSpanText(`cplMain_${prefix}_lblPermitFinaledDate`);
        data.expirationDate = await getSpanText(`cplMain_${prefix}_lblPermitExpirationDate`);

        // Normalize status using eTRAKiT status normalizer
        if (data.status) {
            const { normalizeEtrakitStatus } = await import("../utils/etrakit-status");
            data.status = normalizeEtrakitStatus(data.status);
        }

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
     * Uses configurable element IDs from getConfig()
     */
    protected async extractSiteInfoTab(): Promise<Partial<PermitData>> {
        const config = this.getConfig();
        const prefix = config.siteInfoTabIdPrefix;
        
        const getElementText = async (id: string): Promise<string | null> => {
            try {
                const element = await this.page!.$(`#${id}`);
                if (element) {
                    const text = await this.page!.evaluate((el: any) => el.textContent?.trim() || '', element);
                    return text || null;
                }
            } catch (e) {
                // Ignore errors
            }
            return null;
        };

        // Get address from the link (cplMain_{prefix}_hlSiteAddress)
        // The link text contains the address, but we need to clean it up (remove the map icon text if present)
        let address: string | undefined;
        try {
            const addressElement = await this.page!.$(`#cplMain_${prefix}_hlSiteAddress`);
            if (addressElement) {
                const addressText = await this.page!.evaluate((el: any) => {
                    // Get text content, but exclude img elements
                    const clone = el.cloneNode(true);
                    const imgs = clone.querySelectorAll('img');
                    imgs.forEach((img: any) => img.remove());
                    return clone.textContent?.trim() || '';
                }, addressElement);
                address = addressText || undefined;
            }
        } catch (e) {
            // Ignore errors
        }

        // Get zip code from City/State/Zip field (cplMain_{prefix}_lblSiteCityStateZip)
        // Format: "CITY, STATE, ZIP"
        let zipCode: string | undefined;
        try {
            const cityStateZipText = await getElementText(`cplMain_${prefix}_lblSiteCityStateZip`);
            if (cityStateZipText) {
                // Extract 5-digit zip code
                const zipMatch = cityStateZipText.match(/\b(\d{5})\b/);
                if (zipMatch) {
                    zipCode = zipMatch[1];
                }
            }
        } catch (e) {
            // Ignore errors
        }

        return {
            address: address || undefined,
            zipCode: zipCode || undefined,
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
     * @param permitNumber - The permit number to extract
     * @param contractorFromTable - Optional contractor name extracted from search results table
     */
    protected async extractPermitDetail(permitNumber: string, contractorFromTable?: string): Promise<PermitData | null> {
        // Start with basic permit data
        const permitData: Partial<PermitData> = {
            permitNumber,
            city: this.city,
            state: this.state,
            sourceUrl: this.url,
            // Use contractor from table if available, otherwise will try to extract from Contacts tab
            licensedProfessionalText: contractorFromTable || undefined,
        };

        try {
            // Click on the permit row to navigate to detail page
            const clicked = await this.clickPermitRow(permitNumber);
            if (!clicked) {
                console.warn(`[${this.getName()}] Could not find permit row for ${permitNumber}`);
                return null;
            }

            // Verify we're on the detail page by checking for expected elements
            const config = this.getConfig();
            const permitInfoPrefix = config.permitInfoTabIdPrefix;
            try {
                await this.page!.waitForSelector(`#cplMain_${permitInfoPrefix}_lblPermitType, #cplMain_${permitInfoPrefix}_lblPermitStatus`, { timeout: 5000 });
            } catch (e) {
                console.warn(`[${this.getName()}] Detail page may not have loaded for ${permitNumber}`);
            }

            // Extract from Permit Info tab (default tab)
            const permitInfo = await this.extractPermitInfoTab();
            Object.assign(permitData, permitInfo);

            // Extract from Contacts tab (only if configured and we don't already have contractor from table)
            // Contractor can be in either the search results table or the Contacts tab
            if (config.hasContactsTab && !contractorFromTable) {
                const contactsClicked = await this.clickTab('Contacts');
                if (contactsClicked) {
                    const contactsInfo = await this.extractContactsTab();
                    Object.assign(permitData, contactsInfo);
                }
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
     * Uses pagination configuration from getConfig()
     */
    protected async navigatePagesAndExtract(limit?: number): Promise<PermitData[]> {
        const config = this.getConfig();
        const allPermits: PermitData[] = [];
        let pageNum = 1;
        const maxPages = config.paginationConfig.maxPages;

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

                console.log(`[${this.getName()}] Extracting permit: ${row.permitNumber}${row.contractor ? ` (contractor from table: ${row.contractor})` : ''}`);

                // Click into the permit detail page
                try {
                    // Pass contractor info from table if available
                    // extractPermitDetail will use table contractor if provided, otherwise try Contacts tab
                    const permitData = await this.extractPermitDetail(row.permitNumber, row.contractor);
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

            // Check if there's a next page using configured selector
            const nextPageSelector = config.paginationConfig.nextPageSelector;
            const hasNextPage = await this.page!.evaluate((selector: string) => {
                // Look for next page button by selector
                const nextBtn = (globalThis as any).document.querySelector(selector) as any;
                if (nextBtn) {
                    return !nextBtn.disabled && !nextBtn.classList.contains('aspNetDisabled');
                }
                
                // Fallback: try finding by onclick attribute if selector contains pattern
                if (selector.includes('btnPageNext') || selector.includes('NextPage')) {
                    const allInputs = Array.from((globalThis as any).document.querySelectorAll('input[onclick*="changePage"]')) as any[];
                    for (const input of allInputs) {
                        if (input.classList.contains('NextPage') && !input.disabled && !input.classList.contains('aspNetDisabled')) {
                            return true;
                        }
                    }
                }
                
                return false;
            }, nextPageSelector);

            if (!hasNextPage) {
                console.log(`[${this.getName()}] No more pages`);
                break;
            }

            // Click next page button
            const clicked = await this.page!.evaluate((selector: string) => {
                // Try to find and click the NextPage button
                const nextBtn = (globalThis as any).document.querySelector(`${selector}:not(.aspNetDisabled)`) as any;
                if (nextBtn && !nextBtn.disabled) {
                    nextBtn.click();
                    return true;
                }
                return false;
            }, nextPageSelector);

            if (!clicked) {
                // Fallback: try using Puppeteer's native click
                try {
                    const nextButton = await this.page!.$(`${nextPageSelector}:not(.aspNetDisabled)`);
                    if (nextButton) {
                        await nextButton.click();
                    } else {
                        console.log(`[${this.getName()}] Could not find next page button`);
                        break;
                    }
                } catch (e) {
                    console.log(`[${this.getName()}] Error clicking next page: ${e}`);
                    break;
                }
            }

            // Wait for page to load (use configured wait time or default)
            const waitTime = config.paginationConfig.waitAfterPageClick || 3000;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            
            try {
                await this.page!.waitForSelector('tr.rgRow, tr.rgAltRow', { timeout: 10000 });
            } catch (e) {
                console.warn(`[${this.getName()}] Timeout waiting for next page results`);
            }

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
     * Main scrape method - implements common ID-based scraping logic
     * Uses configuration from getConfig() for city-specific behavior
     */
    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
        try {
            const config = this.getConfig();
            console.log(`[${this.getName()}] Starting scrape for ${this.city}`);

            // Initialize browser
            await this.initializeBrowser();

            // Navigate to search page
            await this.navigateToSearchPage();

            const allPermits: PermitData[] = [];

            // Get permit prefixes with dynamic year (use startDate for year determination)
            const permitPrefixes = this.getPermitPrefixes(startDate);

            // Search for each prefix
            for (const prefix of permitPrefixes) {
                console.log(`[${this.getName()}] Searching for prefix: ${prefix}`);

                // Search in batches: prefix-00, prefix-01, etc. (number of digits from getSuffixDigits())
                // Start from the calculated starting batch number (for incremental scraping)
                let batchNumber = this.startingBatchNumbers.get(prefix) ?? 0;
                if (batchNumber > 0) {
                    console.log(`[${this.getName()}] Starting from batch ${batchNumber} for ${prefix} (incremental scraping)`);
                }
                let hasMoreBatches = true;

                while (hasMoreBatches) {
                    // Format batch search string: prefix-00, prefix-01, etc. (or prefix-000, prefix-0000 depending on suffixDigits)
                    const batchSuffix = String(batchNumber).padStart(config.suffixDigits, "0");
                    const searchValue = `${prefix}-${batchSuffix}`;

                    console.log(`[${this.getName()}] Searching batch: ${searchValue}`);

                    // Set up search filters using configuration
                    await this.setSearchFilters(
                        '#cplMain_ddSearchBy',        // Search By selector
                        config.searchByValue,         // Search By value from config
                        '#cplMain_ddSearchOper',      // Search Operator selector
                        config.searchOperatorValue,   // Search Operator value from config
                        '#cplMain_txtSearchString',   // Search Value selector
                        searchValue                   // Search Value (e.g., "B-AC25-00")
                    );

                    // Execute search using configured button selector
                    await this.executeSearch(config.searchButtonSelector);

                    // Check how many results we got
                    const resultCount = await this.getResultCount();
                    console.log(`[${this.getName()}] Found ${resultCount} results for ${searchValue}`);

                    // If no results, move to next prefix
                    if (resultCount === 0) {
                        hasMoreBatches = false;
                        continue;
                    }

                    // Extract permits by clicking into detail pages
                    const batchPermits = await this.navigatePagesAndExtract(limit ? limit - allPermits.length : undefined);
                    allPermits.push(...batchPermits);

                    // Check if we hit the limit
                    if (limit && allPermits.length >= limit) {
                        console.log(`[${this.getName()}] Reached limit of ${limit} permits`);
                        allPermits.splice(limit);
                        hasMoreBatches = false;
                        break; // Break out of batch loop
                    }

                    // Determine if we should continue to next batch
                    // For cities with larger batch sizes (like Milpitas), check if we hit max
                    // For cities with smaller batch sizes (like Morgan Hill/Los Altos), continue if we got any results
                    if (resultCount >= config.maxResultsPerBatch) {
                        batchNumber++;
                        console.log(`[${this.getName()}] Got ${resultCount} results (max), checking next batch...`);
                    } else {
                        // Got fewer than max results, we've covered all permits for this batch
                        // For smaller batch sizes, continue anyway if we got results
                        if (resultCount > 0 && config.maxResultsPerBatch <= 50) {
                            // Small batch size - continue as long as we get results
                            batchNumber++;
                            console.log(`[${this.getName()}] Got ${resultCount} results, checking next batch...`);
                        } else {
                            // Large batch size or no results - we're done with this prefix
                            hasMoreBatches = false;
                        }
                    }
                }

                // Check if we hit the limit after processing all batches for this prefix
                // If so, break out of the prefix loop
                if (limit && allPermits.length >= limit) {
                    break;
                }
            }

            // Apply limit if specified
            const permits = limit && limit > 0
                ? allPermits.slice(0, limit)
                : allPermits;

            if (limit && limit > 0) {
                console.log(`[${this.getName()}] Limited to ${permits.length} permits (from ${allPermits.length})`);
            }

            console.log(`[${this.getName()}] Extracted ${permits.length} permits total`);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            console.error(`[${this.getName()}] Error during scrape:`, error);
            return {
                permits: [],
                success: false,
                error: error?.message || String(error),
                scrapedAt: new Date(),
            };
        } finally {
            // Clean up using base class method
            await this.cleanup();
        }
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

