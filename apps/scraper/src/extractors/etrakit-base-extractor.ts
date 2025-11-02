/**
 * Base extractor for eTRAKiT-based permit systems
 * Provides common functionality for cities using eTRAKiT platform
 */

import { BaseDailyExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

export abstract class EtrakitBaseExtractor extends BaseDailyExtractor {
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
     * Click button by finding element with specific text content
     */
    protected async clickButtonByText(
        selectors: string[],
        textOptions: string[]
    ): Promise<boolean> {
        for (const selector of selectors) {
            try {
                const buttons = await this.page!.$$(selector);
                for (const button of buttons) {
                    const text = await this.page!.evaluate(el => {
                        const htmlEl = el as { textContent?: string | null };
                        const inputEl = el as { value?: string | null };
                        return htmlEl.textContent || 
                               inputEl.value || 
                               '';
                    }, button);
                    
                    const normalizedText = text.trim().toUpperCase();
                    const found = textOptions.some(option => 
                        normalizedText.includes(option.toUpperCase())
                    );
                    
                    if (found) {
                        await button.click();
                        return true;
                    }
                }
            } catch (e) {
                // Continue to next selector
            }
        }
        return false;
    }

    /**
     * Set up download handling for eTRAKiT Excel/CSV exports
     */
    protected setupDownloadHandling(downloadsDir: string): Promise<string> {
        let downloadResolved = false;
        const downloadPromise = new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!downloadResolved) {
                    downloadResolved = true;
                    reject(new Error("Download timeout"));
                }
            }, 60000);
            
            const responseHandler = async (response: any) => {
                if (downloadResolved) return;
                
                const contentType = response.headers()['content-type'] || '';
                const contentDisposition = response.headers()['content-disposition'] || '';
                const url = response.url();
                
                if (contentType.includes('excel') || 
                    contentType.includes('spreadsheet') ||
                    contentType.includes('application/vnd.ms-excel') ||
                    contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml') ||
                    contentType.includes('text/csv') ||
                    contentDisposition.includes('excel') ||
                    contentDisposition.includes('.xlsx') ||
                    contentDisposition.includes('.xls') ||
                    contentDisposition.includes('.csv') ||
                    url.includes('export') ||
                    url.includes('Excel')) {
                    
                    console.log(`[${this.getName()}] Detected Excel/CSV download response: ${url}`);
                    downloadResolved = true;
                    clearTimeout(timeout);
                    this.page!.off('response', responseHandler);
                    
                    try {
                        let buffer: Buffer | null = null;
                        try {
                            buffer = await response.buffer();
                            if (buffer) {
                                console.log(`[${this.getName()}] Buffer read from response: ${buffer.length} bytes`);
                            }
                        } catch (e: any) {
                            console.log(`[${this.getName()}] Response buffer unavailable (${e?.message}), will use file system monitoring`);
                            buffer = null;
                        }
                        
                        if (buffer !== null) {
                            let fileName = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)?.[1]?.replace(/['"]/g, '');
                            
                            if (!fileName) {
                                if (contentType.includes('csv')) {
                                    fileName = `export_${Date.now()}.csv`;
                                } else {
                                    fileName = `export_${Date.now()}.xlsx`;
                                }
                            }
                            
                            if (contentType.includes('csv') && !fileName.endsWith('.csv')) {
                                fileName = fileName.replace(/\.(xlsx|xls)$/, '.csv');
                            }
                            
                            const filePath = path.join(downloadsDir, fileName);
                            fs.writeFileSync(filePath, buffer);
                            console.log(`[${this.getName()}] Saved file: ${fileName} (${buffer.length} bytes) at ${filePath}`);
                            resolve(filePath);
                        } else {
                            reject(new Error("Response buffer unavailable, will use file system monitoring"));
                        }
                    } catch (e: any) {
                        console.error(`[${this.getName()}] Error saving file:`, e?.message || e);
                        reject(e);
                    }
                }
            };
            
            this.page!.on('response', responseHandler);
        });

        return downloadPromise;
    }

    /**
     * Wait for file download to complete using file system monitoring
     */
    protected async waitForDownload(
        downloadsDir: string,
        timeout: number
    ): Promise<string | null> {
        const startTime = Date.now();
        let lastFileSize = 0;
        let stableCount = 0;
        
        console.log(`[${this.getName()}] Monitoring downloads in: ${downloadsDir}`);
        
        while (Date.now() - startTime < timeout) {
            try {
                const files = fs.readdirSync(downloadsDir);
                const allFiles = files.filter(f => 
                    f.endsWith('.xlsx') || 
                    f.endsWith('.xls') || 
                    f.endsWith('.csv') ||
                    f.endsWith('.crdownload')
                );
                
                if (allFiles.length > 0) {
                    const completeFiles = allFiles.filter(f => 
                        !f.endsWith('.crdownload') && 
                        (f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'))
                    );
                    
                    if (completeFiles.length > 0) {
                        const filePath = path.join(downloadsDir, completeFiles[0]);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.size === lastFileSize) {
                            stableCount++;
                            if (stableCount >= 3) {
                                console.log(`[${this.getName()}] Download complete: ${completeFiles[0]} (${stats.size} bytes)`);
                                return filePath;
                            }
                        } else {
                            stableCount = 0;
                            lastFileSize = stats.size;
                        }
                    }
                    
                    if (allFiles.some(f => f.endsWith('.crdownload'))) {
                        console.log(`[${this.getName()}] Download in progress...`);
                    }
                }
            } catch (e) {
                // Directory might not exist yet
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Check one more time after timeout
        try {
            const files = fs.readdirSync(downloadsDir);
            const excelFiles = files.filter(f => 
                f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv')
            );
            if (excelFiles.length > 0) {
                return path.join(downloadsDir, excelFiles[0]);
            }
        } catch (e) {
            // Ignore
        }
        
        return null;
    }

    /**
     * Parse date string (MM/DD/YYYY format) or Excel date serial number
     */
    protected parseDate(dateStr: string | number | null): Date | undefined {
        if (!dateStr) return undefined;
        
        // If it's already a number (Excel serial date), handle it
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
            
            // Handle 2-digit years
            if (year < 100) {
                year += year < 50 ? 2000 : 1900;
            }
            
            // Validate year is reasonable
            if (year < 1900 || year >= 2100) {
                console.warn(`[${this.getName()}] Invalid year: ${year}, skipping date`);
                return undefined;
            }
            
            // Validate month and day
            if (month < 1 || month > 12 || day < 1 || day > 31) {
                console.warn(`[${this.getName()}] Invalid date: ${month}/${day}/${year}, skipping`);
                return undefined;
            }
            
            // Create date in UTC to avoid timezone issues
            const date = new Date(Date.UTC(year, month - 1, day));
            
            if (isNaN(date.getTime())) {
                console.warn(`[${this.getName()}] Invalid date result for ${str}, skipping`);
                return undefined;
            }
            
            return date;
        }
        
        // Fallback: try to parse as Date object
        try {
            const date = new Date(str);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                if (year >= 1900 && year < 2100) {
                    return date;
                }
            }
        } catch {
            // Ignore
        }
        
        return undefined;
    }

    /**
     * Get cell value from row array
     */
    protected getCellValue(row: any[], columnIndex: number | undefined): any {
        if (columnIndex === undefined || !row || columnIndex >= row.length) {
            return null;
        }
        return row[columnIndex];
    }

    /**
     * Parse Excel/CSV file and extract permit data
     * Subclasses can override to customize parsing logic
     */
    protected abstract parseExcelFile(filePath: string): Promise<PermitData[]>;

    /**
     * Required by base class - but we parse Excel instead
     */
    protected async parsePermitData(rawData: any): Promise<PermitData[]> {
        // This shouldn't be called since we override scrape()
        return [];
    }

    /**
     * Initialize browser and page for scraping
     */
    protected async initializeBrowser(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const context = await this.browser.createBrowserContext();
        this.page = await context.newPage();

        // Set viewport
        await this.page.setViewport({ width: 1920, height: 1080 });
    }

    /**
     * Setup downloads directory and CDP download behavior
     * Returns both the downloads directory path and a promise for the download
     */
    protected async setupDownloads(): Promise<{ downloadsDir: string; downloadPromise: Promise<string> }> {
        const downloadsDir = path.join(process.cwd(), "temp-downloads");
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        // Enable downloads using CDP
        const client = await this.page!.target().createCDPSession();
        await client.send("Page.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: downloadsDir,
        });
        console.log(`[${this.getName()}] CDP download behavior set to: ${downloadsDir}`);

        // Set up download handling (returns a Promise)
        const downloadPromise = this.setupDownloadHandling(downloadsDir);

        return { downloadsDir, downloadPromise };
    }

    /**
     * Navigate to the permit search page
     */
    protected async navigateToSearchPage(): Promise<void> {
        await this.page!.goto(this.url, {
            waitUntil: "networkidle2",
            timeout: 60000,
        });
        console.log(`[${this.getName()}] Page loaded`);
    }

    /**
     * Set search filters for eTRAKiT
     * Subclasses can override to customize filter logic
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
    protected async executeSearch(
        searchButtonSelector: string,
        resultsIndicatorSelector?: string
    ): Promise<void> {
        console.log(`[${this.getName()}] Filters set, clicking search...`);

        // Click search button
        const searchButton = await this.page!.$ (searchButtonSelector);
        if (!searchButton) {
            throw new Error(`Could not find search button with selector '${searchButtonSelector}'`);
        }

        await searchButton.click();
        console.log(`[${this.getName()}] Search button clicked, waiting for postback...`);

        // Wait for postback to complete - look for results to appear
        const defaultIndicator = resultsIndicatorSelector || '#cplMain_lblMoreResults, table tbody tr';
        try {
            await this.page!.waitForFunction(
                () => {
                    const lbl = (globalThis as any).document.querySelector('#cplMain_lblMoreResults');
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
            await this.page!.waitForSelector(defaultIndicator, {
                timeout: 15000,
            });
            console.log(`[${this.getName()}] Results loaded`);
        } catch (e) {
            console.warn(`[${this.getName()}] Timeout waiting for results, continuing anyway...`);
        }

        // Additional wait for page to stabilize after postback
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    /**
     * Click export button and wait for download
     */
    protected async clickExportButton(
        downloadPromise: Promise<string>,
        downloadsDir: string,
        exportButtonSelector?: string,
        fallbackTextOptions?: string[]
    ): Promise<string> {
        console.log(`[${this.getName()}] Looking for Excel export button...`);

        const defaultTextOptions = ['EXPORT TO EXCEL', 'Export to Excel', 'Export', 'EXPORT', 'Excel'];
        const textOptions = fallbackTextOptions || defaultTextOptions;

        // Try specific selector first if provided
        if (exportButtonSelector) {
            const exportButton = await this.page!.$ (exportButtonSelector);
            if (exportButton) {
                await exportButton.click();
                console.log(`[${this.getName()}] Export button clicked using selector: ${exportButtonSelector}`);
                return await this.waitForDownloadFile(downloadPromise, downloadsDir);
            }
        }

        // Fallback to text search
        const clicked = await this.clickButtonByText(
            ['a', 'input[type="button"]', 'input[type="submit"]', 'button'],
            textOptions
        );

        if (!clicked) {
            throw new Error("Could not find Excel export button");
        }

        console.log(`[${this.getName()}] Export button clicked, waiting for download...`);
        return await this.waitForDownloadFile(downloadPromise, downloadsDir);
    }

    /**
     * Wait for downloaded file to be ready
     * Tries downloadPromise first, then falls back to file system monitoring
     */
    protected async waitForDownloadFile(
        downloadPromise?: Promise<string>,
        downloadsDir?: string
    ): Promise<string> {
        const dir = downloadsDir || path.join(process.cwd(), "temp-downloads");
        
        console.log(`[${this.getName()}] Waiting for Excel file download...`);
        
        // Try the download promise first if provided
        if (downloadPromise) {
            try {
                const filePath = await downloadPromise;
                console.log(`[${this.getName()}] Excel file downloaded: ${filePath}`);
                return filePath;
            } catch (e: any) {
                console.log(`[${this.getName()}] Response handler failed (${e?.message}), using file system monitoring...`);
            }
        }
        
        // Fallback to file system monitoring
        const fsFile = await this.waitForDownload(dir, 30000);
        if (!fsFile) {
            throw new Error("Excel file download timed out or failed");
        }
        console.log(`[${this.getName()}] Excel file found via file system: ${fsFile}`);
        return fsFile;
    }

    /**
     * Clean up downloaded files
     */
    protected cleanupFiles(filePath: string, downloadsDir?: string): void {
        try {
            const dir = downloadsDir || path.join(process.cwd(), "temp-downloads");
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
                fs.rmdirSync(dir);
            }
        } catch (e) {
            console.warn(`[${this.getName()}] Could not clean up temp files: ${e}`);
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

