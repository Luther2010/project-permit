/**
 * Saratoga Extractor implementation
 * Uses Puppeteer to interact with eTRAKiT platform
 * Downloads Excel export and parses it for permit data
 */

import { BaseExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

export class SaratogaExtractor extends BaseExtractor {
    private browser: Browser | null = null;
    private page: Page | null = null;

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            console.log(`[SaratogaExtractor] Starting scrape for ${this.city}`);

            // Launch browser with download settings
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            // Create a temporary downloads directory
            const downloadsDir = path.join(process.cwd(), "temp-downloads");
            if (!fs.existsSync(downloadsDir)) {
                fs.mkdirSync(downloadsDir, { recursive: true });
            }

            const context = await this.browser.createBrowserContext();
            this.page = await context.newPage();

            // Enable downloads using CDP
            const client = await this.page.target().createCDPSession();
            await client.send("Page.setDownloadBehavior", {
                behavior: "allow",
                downloadPath: downloadsDir,
            });
            console.log(`[SaratogaExtractor] CDP download behavior set to: ${downloadsDir}`);

            // Set up download handling by intercepting responses before body is consumed
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
                        contentType.includes('text/csv') ||  // CSV is often used for "Excel exports"
                        contentDisposition.includes('excel') ||
                        contentDisposition.includes('.xlsx') ||
                        contentDisposition.includes('.xls') ||
                        contentDisposition.includes('.csv') ||
                        url.includes('export') ||
                        url.includes('Excel')) {
                        
                        console.log(`[SaratogaExtractor] Detected Excel/CSV download response: ${url}`);
                        downloadResolved = true;
                        clearTimeout(timeout);
                        this.page!.off('response', responseHandler);
                        
                        try {
                            // Try to get the response body
                            let buffer: Buffer | null = null;
                            try {
                                buffer = await response.buffer();
                                if (buffer) {
                                    console.log(`[SaratogaExtractor] Buffer read from response: ${buffer.length} bytes`);
                                }
                            } catch (e: any) {
                                console.log(`[SaratogaExtractor] Response buffer unavailable (${e?.message}), will use file system monitoring`);
                                // Don't reject - let file system monitoring handle it
                                buffer = null;
                            }
                            
                            if (buffer !== null) {
                                // Save file from buffer
                                let fileName = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)?.[1]?.replace(/['"]/g, '');
                                
                                // If no filename in headers, generate one based on content type
                                if (!fileName) {
                                    if (contentType.includes('csv')) {
                                        fileName = `export_${Date.now()}.csv`;
                                    } else {
                                        fileName = `export_${Date.now()}.xlsx`;
                                    }
                                }
                                
                                // Ensure .csv files have .csv extension (for parsing)
                                if (contentType.includes('csv') && !fileName.endsWith('.csv')) {
                                    fileName = fileName.replace(/\.(xlsx|xls)$/, '.csv');
                                }
                                
                                const filePath = path.join(downloadsDir, fileName);
                                fs.writeFileSync(filePath, buffer);
                                console.log(`[SaratogaExtractor] Saved file: ${fileName} (${buffer.length} bytes) at ${filePath}`);
                                resolve(filePath);
                            } else {
                                // Buffer unavailable - reject so we fall back to file system monitoring
                                reject(new Error("Response buffer unavailable, will use file system monitoring"));
                            }
                        } catch (e: any) {
                            console.error(`[SaratogaExtractor] Error saving file:`, e?.message || e);
                            reject(e);
                        }
                    }
                };
                
                this.page!.on('response', responseHandler);
            });

            // Set viewport
            await this.page.setViewport({ width: 1920, height: 1080 });

            // Navigate to the permit search page
            await this.page.goto(this.url, {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            console.log(`[SaratogaExtractor] Page loaded, setting up filters...`);

            // Format date for eTRAKiT (MM/DD/YYYY format)
            const dateStr = scrapeDate 
                ? this.formatDateForETRAKiT(scrapeDate)
                : this.formatDateForETRAKiT(new Date());

            console.log(`[SaratogaExtractor] Searching for permits with applied date: ${dateStr}`);

            // Wait for page to be interactive
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Set "Search By" dropdown - APPLIED DATE is already selected by default
            // Check if it's already set correctly to avoid triggering postback
            const currentSearchBy = await this.page.evaluate(() => {
                const select = (globalThis as any).document.querySelector('#cplMain_ddSearchBy') as any;
                if (!select) return null;
                const selected = select.options[select.selectedIndex];
                return selected ? selected.text.trim() : null;
            });
            
            if (currentSearchBy !== "APPLIED DATE") {
                console.log(`[SaratogaExtractor] Setting SearchBy from "${currentSearchBy}" to "APPLIED DATE" (this will trigger postback)`);
                const searchBySet = await this.setDropdownValue(
                    '#cplMain_ddSearchBy',
                    "APPLIED DATE"
                );
                if (!searchBySet) {
                    throw new Error("Could not set SearchBy dropdown");
                }
                // Wait for postback to complete after changing SearchBy
                await new Promise((resolve) => setTimeout(resolve, 3000));
            } else {
                console.log(`[SaratogaExtractor] SearchBy already set to APPLIED DATE (skipping)`);
            }

            // Set "Search Operator" dropdown to "EQUALS" (note: value is "EQUALS", not "Equals")
            const operatorSet = await this.setDropdownValue(
                '#cplMain_ddSearchOper',
                "EQUALS"
            );
            if (!operatorSet) {
                // Try with "Equals" text match as fallback
                const operatorSet2 = await this.page.evaluate((val: string) => {
                    const select = (globalThis as any).document.querySelector('#cplMain_ddSearchOper') as any;
                    if (!select) return false;
                    const options = Array.from(select.options) as any[];
                    const option = options.find((opt: any) => opt.value === val || opt.text?.includes("Equals"));
                    if (option) {
                        select.value = option.value;
                        select.dispatchEvent(new Event("change", { bubbles: true }));
                        return true;
                    }
                    return false;
                }, "EQUALS");
                if (operatorSet2) {
                    console.log(`[SaratogaExtractor] SearchOperator set to EQUALS (via fallback)`);
                } else {
                    throw new Error("Could not set SearchOperator dropdown");
                }
            } else {
                console.log(`[SaratogaExtractor] SearchOperator set to EQUALS`);
            }

            // Set "Search Value" input field
            const valueSet = await this.setInputValue(
                '#cplMain_txtSearchString',
                dateStr
            );
            if (!valueSet) {
                throw new Error("Could not set SearchValue input");
            }
            console.log(`[SaratogaExtractor] SearchValue set to: ${dateStr}`);

            console.log(`[SaratogaExtractor] Filters set, clicking search...`);

            // Click search button using the specific ID from the HTML
            // This will trigger an ASP.NET postback
            const searchButton = await this.page.$('#ctl00_cplMain_btnSearch');
            if (!searchButton) {
                throw new Error("Could not find search button with id 'ctl00_cplMain_btnSearch'");
            }
            
            await searchButton.click();
            console.log(`[SaratogaExtractor] Search button clicked, waiting for postback...`);
            
            // Wait for postback to complete - look for results to appear
            // ASP.NET postbacks might not trigger navigation, so wait for DOM updates instead
            try {
                await this.page.waitForFunction(
                    () => {
                        const lbl = (globalThis as any).document.querySelector('#cplMain_lblMoreResults');
                        const table = (globalThis as any).document.querySelector('table tbody tr');
                        return (lbl && lbl.textContent && lbl.textContent.includes('record')) || table;
                    },
                    { timeout: 30000 }
                );
                console.log(`[SaratogaExtractor] Postback complete, results visible`);
            } catch (e) {
                console.warn(`[SaratogaExtractor] Timeout waiting for postback, continuing...`);
            }

            // Wait for results to load - check for results message or table
            console.log(`[SaratogaExtractor] Waiting for search results...`);
            try {
                await this.page.waitForSelector('#cplMain_lblMoreResults, table tbody tr', {
                    timeout: 15000,
                });
                console.log(`[SaratogaExtractor] Results loaded`);
            } catch (e) {
                console.warn(`[SaratogaExtractor] Timeout waiting for results, continuing anyway...`);
            }
            
            // Additional wait for page to stabilize after postback
            await new Promise((resolve) => setTimeout(resolve, 3000));

            // Look for "EXPORT TO EXCEL" button and click it
            console.log(`[SaratogaExtractor] Looking for Excel export button...`);
            
            // Debug: log all buttons/links that might be export
            const exportButtons = await this.page.evaluate(() => {
                const buttons: Array<{ tag: string; text: string; id: string; href?: string }> = [];
                (globalThis as any).document.querySelectorAll('a, input[type="button"], input[type="submit"], button').forEach((el: any) => {
                    const text = (el.textContent || el.value || '').trim();
                    if (text.toUpperCase().includes('EXPORT') || text.toUpperCase().includes('EXCEL')) {
                        buttons.push({
                            tag: el.tagName,
                            text: text,
                            id: el.id || '',
                            href: el.href || ''
                        });
                    }
                });
                return buttons;
            });
            console.log(`[SaratogaExtractor] Found export-related buttons:`, JSON.stringify(exportButtons, null, 2));
            
            // Use the specific export button ID we found
            const exportButton = await this.page.$('#cplMain_btnExportToExcel');
            if (!exportButton) {
                // Fallback to text search
                const clicked = await this.clickButtonByText([
                    'a',
                    'input[type="button"]',
                    'input[type="submit"]',
                    'button',
                ], ['EXPORT TO EXCEL', 'Export to Excel', 'Export', 'EXPORT', 'Excel']);
                
                if (!clicked) {
                    throw new Error("Could not find Excel export button");
                }
            } else {
                await exportButton.click();
                console.log(`[SaratogaExtractor] Export button clicked using ID: cplMain_btnExportToExcel`);
            }
            
            console.log(`[SaratogaExtractor] Export button clicked, waiting for download...`);

            // Wait for file download using event listener or file system monitoring
            console.log(`[SaratogaExtractor] Waiting for Excel file download...`);
            let excelFile: string;
            try {
                excelFile = await downloadPromise as string;
                console.log(`[SaratogaExtractor] Excel file downloaded: ${excelFile}`);
            } catch (e: any) {
                // Fallback to file system monitoring (CDP download should save it)
                console.log(`[SaratogaExtractor] Response handler failed (${e?.message}), using file system monitoring...`);
                const fsFile = await this.waitForDownload(downloadsDir, 30000);
                if (!fsFile) {
                    throw new Error("Excel file download timed out or failed");
                }
                excelFile = fsFile;
                console.log(`[SaratogaExtractor] Excel file found via file system: ${excelFile}`);
            }

            // Parse Excel file
            const allPermits = await this.parseExcelFile(excelFile);

            // Apply limit if specified (for testing)
            const permits = limit && limit > 0 
                ? allPermits.slice(0, limit)
                : allPermits;
            
            if (limit && limit > 0) {
                console.log(`[SaratogaExtractor] Limited to ${permits.length} permits (from ${allPermits.length})`);
            }

            // Clean up downloaded file
            try {
                fs.unlinkSync(excelFile);
                fs.rmdirSync(downloadsDir);
            } catch (e) {
                console.warn(`Could not clean up temp files: ${e}`);
            }

            console.log(`[SaratogaExtractor] Parsed ${permits.length} permits from Excel`);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error) {
            console.error(`[SaratogaExtractor] Error:`, error);
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
     * Set dropdown value by finding the option text
     */
    private async setDropdownValue(selector: string, value: string): Promise<boolean> {
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
    private async setInputValue(selector: string, value: string): Promise<boolean> {
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
     * Click button by trying multiple selectors
     */
    private async clickButton(selectors: string[]): Promise<boolean> {
        for (const selector of selectors) {
            try {
                const button = await this.page!.$(selector);
                if (button) {
                    await button.click();
                    return true;
                }
            } catch (e) {
                // Continue to next selector
            }
        }
        return false;
    }

    /**
     * Click button by finding element with specific text content
     */
    private async clickButtonByText(
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
     * Wait for file download to complete
     */
    private async waitForDownload(
        downloadsDir: string,
        timeout: number
    ): Promise<string | null> {
        const startTime = Date.now();
        let lastFileSize = 0;
        let stableCount = 0;
        
        console.log(`[SaratogaExtractor] Monitoring downloads in: ${downloadsDir}`);
        
        while (Date.now() - startTime < timeout) {
            try {
                const files = fs.readdirSync(downloadsDir);
            const allFiles = files.filter(f => 
                f.endsWith('.xlsx') || 
                f.endsWith('.xls') || 
                f.endsWith('.csv') ||
                f.endsWith('.crdownload') // Chrome partial download
            );
                
                if (allFiles.length > 0) {
                    // Check for complete files (not .crdownload)
                    const completeFiles = allFiles.filter(f => 
                        !f.endsWith('.crdownload') && 
                        (f.endsWith('.xlsx') || f.endsWith('.xls') || f.endsWith('.csv'))
                    );
                    
                    if (completeFiles.length > 0) {
                        const filePath = path.join(downloadsDir, completeFiles[0]);
                        const stats = fs.statSync(filePath);
                        
                        // Check if file size is stable (not still downloading)
                        if (stats.size === lastFileSize) {
                            stableCount++;
                            if (stableCount >= 3) {
                                // File size stable for 1.5 seconds, assume complete
                                console.log(`[SaratogaExtractor] Download complete: ${completeFiles[0]} (${stats.size} bytes)`);
                                return filePath;
                            }
                        } else {
                            stableCount = 0;
                            lastFileSize = stats.size;
                        }
                    }
                    
                    // Log progress
                    if (allFiles.some(f => f.endsWith('.crdownload'))) {
                        console.log(`[SaratogaExtractor] Download in progress...`);
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
     * Parse Excel/CSV file and extract permit data
     */
    protected async parseExcelFile(filePath: string): Promise<PermitData[]> {
        const permits: PermitData[] = [];
        
        try {
            // Read Excel or CSV file
            let workbook;
            if (filePath.endsWith('.csv')) {
                // Read CSV file
                const csvContent = fs.readFileSync(filePath, 'utf-8');
                workbook = XLSX.read(csvContent, { type: 'string' });
            } else {
                // Read Excel file
                workbook = XLSX.readFile(filePath);
            }
            
            // Get first sheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // Convert to JSON
            const rows = XLSX.utils.sheet_to_json(worksheet, { 
                header: 1,
                defval: "" 
            }) as any[][];
            
            if (rows.length < 2) {
                console.warn(`[SaratogaExtractor] Excel file has no data rows`);
                return permits;
            }
            
            // First row should be headers - find column indices
            const headerRow = rows[0];
            const columnMap: Record<string, number> = {};
            
            headerRow.forEach((header: string, index: number) => {
                if (typeof header === "string") {
                    const normalized = header.toUpperCase().trim();
                    // Map various possible header names
                    if (normalized.includes("PERMIT") && normalized.includes("#")) {
                        columnMap.permitNumber = index;
                    } else if (normalized.includes("APPLIED")) {
                        columnMap.appliedDate = index;
                    } else if (normalized.includes("ISSUED")) {
                        columnMap.issuedDate = index;
                    } else if (normalized.includes("FINALED")) {
                        columnMap.finaledDate = index;
                    } else if (normalized.includes("EXPIRED")) {
                        columnMap.expiredDate = index;
                    } else if (normalized === "STATUS") {
                        columnMap.status = index;
                    } else if (normalized.includes("ASSESSOR")) {
                        columnMap.assessor = index;
                    } else if (normalized === "ADDRESS") {
                        columnMap.address = index;
                    } else if (normalized === "DESCRIPTION") {
                        columnMap.description = index;
                    } else if (normalized.includes("VALUATION") || normalized.includes("VALUE")) {
                        columnMap.valuation = index;
                    } else if (normalized.includes("CONTRACTOR") || normalized.includes("CONTRACTO")) {
                        columnMap.contractor = index;
                    } else if (normalized.includes("RECORDID")) {
                        columnMap.recordId = index;
                    }
                }
            });
            
            console.log(`[SaratogaExtractor] Column mapping:`, columnMap);
            
            // Process data rows (skip header row)
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                
                // Skip empty rows
                if (!row || row.every(cell => !cell || cell.toString().trim() === "")) {
                    continue;
                }
                
                const permitNumber = this.getCellValue(row, columnMap.permitNumber);
                if (!permitNumber) {
                    continue; // Skip rows without permit number
                }
                
                // Parse dates
                const appliedDateStr = this.getCellValue(row, columnMap.appliedDate);
                const issuedDateStr = this.getCellValue(row, columnMap.issuedDate);
                const expiredDateStr = this.getCellValue(row, columnMap.expiredDate);
                
                let issuedDate: Date | undefined;
                let issuedDateString: string | undefined;
                let expirationDate: Date | undefined;
                let status: string | undefined;
                
                // Determine status and issued date based on ISSUED DATE and APPLIED DATE
                const hasIssuedDate = issuedDateStr && String(issuedDateStr).trim() !== '';
                const hasAppliedDate = appliedDateStr && String(appliedDateStr).trim() !== '';
                
                if (hasIssuedDate) {
                    // If ISSUED DATE is not empty, set issued date and status to ISSUED
                    const issuedDateStrValue = String(issuedDateStr).trim();
                    issuedDateString = issuedDateStrValue;
                    issuedDate = this.parseDate(issuedDateStr);
                    // If we successfully parsed a date, use the formatted string
                    if (issuedDate) {
                        issuedDateString = this.formatDateForETRAKiT(issuedDate);
                    }
                    status = "ISSUED";
                } else if (hasAppliedDate) {
                    // If ISSUED DATE is empty but APPLIED DATE is not empty, set status to IN_REVIEW
                    // Don't set issuedDate - only use ISSUED DATE column for that
                    status = "IN_REVIEW";
                }
                // If both are empty, status remains undefined (will be handled by classification/mapping)
                
                if (expiredDateStr) {
                    expirationDate = this.parseDate(expiredDateStr);
                }
                
                // Parse valuation
                const valuationStr = this.getCellValue(row, columnMap.valuation);
                let value: number | undefined;
                if (valuationStr) {
                    const parsed = parseFloat(valuationStr.toString().replace(/,/g, ""));
                    if (!isNaN(parsed)) {
                        value = parsed;
                    }
                }
                
                // Parse address
                const address = this.getCellValue(row, columnMap.address);
                let streetAddress = "";
                let city = "Saratoga";
                let state = "CA";
                let zipCode = "";
                
                if (address) {
                    // Address parsing - adjust based on actual format
                    const addrStr = address.toString().trim();
                    // Try to extract zip code if present
                    const zipMatch = addrStr.match(/\b(\d{5})\b/);
                    if (zipMatch) {
                        zipCode = zipMatch[1];
                    }
                    streetAddress = addrStr;
                }
                
                // Get description
                const description = this.getCellValue(row, columnMap.description);
                
                // Get contractor name (for future linking)
                const contractorName = this.getCellValue(row, columnMap.contractor);
                
                permits.push({
                    permitNumber: permitNumber.toString().trim(),
                    title: description?.toString().trim() || undefined,
                    description: description?.toString().trim() || undefined,
                    address: streetAddress || undefined,
                    city,
                    state,
                    zipCode: zipCode || undefined,
                    status: status || undefined, // Already a string from our logic above
                    value,
                    issuedDate,
                    issuedDateString,
                    expirationDate,
                    sourceUrl: this.url,
                    // Store contractor name in a custom field for later processing
                    licensedProfessionalText: contractorName?.toString().trim() || undefined,
                });
            }
            
        } catch (error) {
            console.error(`[SaratogaExtractor] Error parsing Excel:`, error);
            throw error;
        }
        
        return permits;
    }

    /**
     * Get cell value from row array
     */
    private getCellValue(row: any[], columnIndex: number | undefined): any {
        if (columnIndex === undefined || !row || columnIndex >= row.length) {
            return null;
        }
        return row[columnIndex];
    }

    /**
     * Parse date string (MM/DD/YYYY format) or Excel date serial number
     */
    private parseDate(dateStr: string | number | null): Date | undefined {
        if (!dateStr) return undefined;
        
        // If it's already a number (Excel serial date), handle it
        if (typeof dateStr === 'number') {
            // Excel serial date: number of days since 1900-01-01
            // Only accept reasonable values (after 1900, before 2100)
            if (dateStr > 0 && dateStr < 73000) {
                // Convert Excel serial to Date (Excel epoch is 1899-12-30)
                const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                const millisecondsPerDay = 24 * 60 * 60 * 1000;
                const date = new Date(excelEpoch.getTime() + dateStr * millisecondsPerDay);
                // Validate the date is reasonable
                if (date.getFullYear() >= 1900 && date.getFullYear() < 2100) {
                    return date;
                }
            }
            // Invalid serial number
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
                console.warn(`[SaratogaExtractor] Invalid year: ${year}, skipping date`);
                return undefined;
            }
            
            // Validate month and day
            if (month < 1 || month > 12 || day < 1 || day > 31) {
                console.warn(`[SaratogaExtractor] Invalid date: ${month}/${day}/${year}, skipping`);
                return undefined;
            }
            
            // Create date in UTC to avoid timezone issues
            const date = new Date(Date.UTC(year, month - 1, day));
            
            // Double-check the date is valid
            if (isNaN(date.getTime())) {
                console.warn(`[SaratogaExtractor] Invalid date result for ${str}, skipping`);
                return undefined;
            }
            
            return date;
        }
        
        // Fallback: try to parse as Date object (Excel sometimes returns dates)
        try {
            const date = new Date(str);
            if (!isNaN(date.getTime())) {
                // Validate the date is reasonable
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
     * Format date for eTRAKiT system (MM/DD/YYYY)
     */
    private formatDateForETRAKiT(date: Date): string {
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const yyyy = String(date.getFullYear());
        return `${mm}/${dd}/${yyyy}`;
    }

    /**
     * Required by base class - but we parse Excel instead
     */
    protected async parsePermitData(rawData: any): Promise<PermitData[]> {
        // This shouldn't be called since we override scrape()
        // But if it is, return empty array
        return [];
    }
}

