/**
 * Los Altos Hills Extractor implementation
 * Uses Puppeteer to interact with eTRAKiT platform
 * Downloads Excel export and parses it for permit data
 */

import { EtrakitBaseExtractor } from "./etrakit-base-extractor";
import { PermitData, ScrapeResult } from "../types";
import * as XLSX from "xlsx";
import * as fs from "fs";

export class LosAltosHillsExtractor extends EtrakitBaseExtractor {

    /**
     * Generate array of dates between startDate and endDate (inclusive)
     */
    private generateDateRange(startDate: Date, endDate: Date): Date[] {
        const dates: Date[] = [];
        const current = new Date(startDate);
        current.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        
        while (current <= end) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        
        return dates;
    }

    async scrape(limit?: number, startDate?: Date, endDate?: Date): Promise<ScrapeResult> {
        try {
            console.log(`[LosAltosHillsExtractor] Starting scrape for ${this.city}`);

            // Determine dates to scrape
            let datesToScrape: Date[] = [];
            if (startDate && endDate) {
                datesToScrape = this.generateDateRange(startDate, endDate);
                console.log(`[LosAltosHillsExtractor] Scraping date range: ${datesToScrape.length} days`);
            } else if (startDate) {
                // Only start date provided - scrape from startDate to today
                datesToScrape = this.generateDateRange(startDate, new Date());
                console.log(`[LosAltosHillsExtractor] Scraping from ${startDate.toISOString().split("T")[0]} to today: ${datesToScrape.length} days`);
            } else {
                // No date provided - scrape today only
                datesToScrape = [new Date()];
            }

            // Initialize browser and setup downloads using base class methods
            await this.initializeBrowser();
            const { downloadsDir, downloadPromise } = await this.setupDownloads();

            const allPermits: PermitData[] = [];

            // Scrape each date in the range
            for (const date of datesToScrape) {
                if (limit && allPermits.length >= limit) {
                    console.log(`[LosAltosHillsExtractor] Reached limit of ${limit} permits`);
                    break;
                }

                // Navigate to search page (re-navigate for each date to avoid stale state)
                await this.navigateToSearchPage();

                // Format date for eTRAKiT (MM/DD/YYYY format)
                const dateStr = this.formatDateForETRAKiT(date);

                console.log(`[LosAltosHillsExtractor] Searching for permits with applied date: ${dateStr}`);

                // Set search filters using base class method
                // Note: Los Altos Hills uses "APPLIED" instead of "APPLIED DATE"
                await this.setSearchFilters(
                    '#cplMain_ddSearchBy',  // Search By selector
                    'APPLIED',              // Search By value (not "APPLIED DATE")
                    '#cplMain_ddSearchOper', // Search Operator selector
                    'EQUALS',               // Search Operator value (try "EQUALS" first, will fallback to "Equals")
                    '#cplMain_txtSearchString', // Search Value selector
                    dateStr                 // Search Value
                );

                // Execute search using base class method
                await this.executeSearch('#ctl00_cplMain_btnSearch');

                // Click export button and wait for download using base class method
                const excelFile = await this.clickExportButton(
                    downloadPromise,
                    downloadsDir,
                    '#cplMain_btnExportToExcel' // Specific export button selector for eTRAKiT
                );

                if (!excelFile) {
                    console.warn(`[LosAltosHillsExtractor] No Excel file downloaded for ${dateStr}, skipping...`);
                    continue;
                }

                // Parse Excel file (subclass-specific)
                const datePermits = await this.parseExcelFile(excelFile);
                allPermits.push(...datePermits);
                console.log(`[LosAltosHillsExtractor] Found ${datePermits.length} permits for ${dateStr}`);
                
                // Clean up downloaded file after processing
                this.cleanupFiles(excelFile, downloadsDir);
            }

            // Apply limit if specified (for testing)
            const permits = limit && limit > 0 
                ? allPermits.slice(0, limit)
                : allPermits;
            
            if (limit && limit > 0) {
                console.log(`[LosAltosHillsExtractor] Limited to ${permits.length} permits (from ${allPermits.length})`);
            }

            console.log(`[LosAltosHillsExtractor] Parsed ${permits.length} permits from Excel`);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error) {
            console.error(`[LosAltosHillsExtractor] Error:`, error);
            return {
                permits: [],
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                scrapedAt: new Date(),
            };
        } finally {
            // Clean up using base class method
            await this.cleanup();
        }
    }


    /**
     * Parse Excel/CSV file and extract permit data
     */
    protected async parseExcelFile(filePath: string): Promise<PermitData[]> {
        const permits: PermitData[] = [];
        
        try {
            // Read Excel or CSV file
            let rows: any[][];
            
            if (filePath.endsWith('.csv')) {
                // For CSV files, parse manually to preserve original date strings
                const csvContent = fs.readFileSync(filePath, 'utf-8');
                const lines = csvContent.split('\n').filter(line => line.trim());
                
                rows = lines.map(line => {
                    // Simple CSV parsing - handle quoted fields
                    const fields: string[] = [];
                    let current = '';
                    let inQuotes = false;
                    
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') {
                            inQuotes = !inQuotes;
                        } else if (char === ',' && !inQuotes) {
                            fields.push(current.trim());
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    fields.push(current.trim()); // Add last field
                    return fields;
                });
            } else {
                // Read Excel file using XLSX
                const workbook = XLSX.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                // Convert to JSON with raw option to preserve date strings
                rows = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: "",
                    raw: false // Convert values but preserve strings
                }) as any[][];
            }
            
            if (rows.length < 2) {
                console.warn(`[LosAltosHillsExtractor] Excel file has no data rows`);
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
                    } else if (normalized.includes("ASSESSOR") || normalized.includes("APN")) {
                        columnMap.assessor = index;
                    } else if (normalized === "ADDRESS") {
                        columnMap.address = index;
                    } else if (normalized === "DESCRIPTION") {
                        columnMap.description = index;
                    } else if (normalized.includes("VALUATION") || normalized.includes("VALUE") || normalized.includes("JOBVALUE")) {
                        columnMap.valuation = index;
                    } else if (normalized.includes("CONTRACTOR") || normalized.includes("CONTRACTO")) {
                        columnMap.contractor = index;
                    } else if (normalized.includes("RECORDID")) {
                        columnMap.recordId = index;
                    }
                }
            });
            
            console.log(`[LosAltosHillsExtractor] Column mapping:`, columnMap);
            
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
                
                // Parse dates - use APPLIED column for appliedDate/appliedDateString
                const appliedDateStr = this.getCellValue(row, columnMap.appliedDate);
                const issuedDateStr = this.getCellValue(row, columnMap.issuedDate);
                const expiredDateStr = this.getCellValue(row, columnMap.expiredDate);
                
                let appliedDate: Date | undefined;
                let appliedDateString: string | undefined;
                let expirationDate: Date | undefined;
                let status: string | undefined;
                
                // Use APPLIED column for appliedDate and appliedDateString
                if (appliedDateStr && String(appliedDateStr).trim() !== '') {
                    // Preserve the original string from CSV
                    let appliedDateStrValue: string;
                    
                    // If it's a number (Excel serial), convert it back to date string
                    if (typeof appliedDateStr === 'number') {
                        const date = this.parseDate(appliedDateStr);
                        if (date) {
                            appliedDateStrValue = this.formatDateForETRAKiT(date);
                            const year = date.getFullYear();
                            if (year >= 2000) {
                                appliedDateStrValue = appliedDateStrValue.replace(/\d{4}$/, String(year).slice(-2));
                            }
                        } else {
                            appliedDateStrValue = String(appliedDateStr);
                        }
                    } else {
                        // Already a string - use it directly
                        appliedDateStrValue = String(appliedDateStr).trim();
                    }
                    
                    // Store the original string format
                    appliedDateString = appliedDateStrValue;
                    
                    // Parse the date for appliedDate field
                    appliedDate = this.parseDate(appliedDateStrValue);
                }
                
                // Determine status based on ISSUED column
                // Los Altos Hills doesn't have a STATUS column, so infer from ISSUED date
                const hasIssuedDate = issuedDateStr && String(issuedDateStr).trim() !== '';
                if (hasIssuedDate) {
                    // If ISSUED column is not empty, status is ISSUED
                    status = "ISSUED";
                } else {
                    // If ISSUED column is empty, status is IN_REVIEW
                    status = "IN_REVIEW";
                }
                
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
                let city = "Los Altos Hills";
                let state = "CA";
                let zipCode: string | undefined = undefined;
                
                if (address) {
                    // Address parsing - Los Altos Hills CSV format may vary
                    const addrStr = address.toString().trim();
                    streetAddress = addrStr;
                    // zipCode remains undefined unless provided in CSV
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
                    status: status || undefined,
                    value,
                    appliedDate,
                    appliedDateString,
                    expirationDate,
                    sourceUrl: this.url,
                    licensedProfessionalText: contractorName?.toString().trim() || undefined,
                });
            }
            
        } catch (error) {
            console.error(`[LosAltosHillsExtractor] Error parsing Excel:`, error);
            throw error;
        }
        
        return permits;
    }
}

