/**
 * Saratoga Extractor implementation
 * Uses Puppeteer to interact with eTRAKiT platform
 * Downloads Excel export and parses it for permit data
 */

import { EtrakitBaseExtractor } from "./etrakit-base-extractor";
import { PermitData, ScrapeResult } from "../types";
import * as XLSX from "xlsx";
import * as fs from "fs";
import { normalizeEtrakitStatus } from "../utils/etrakit-status";

export class SaratogaExtractor extends EtrakitBaseExtractor {

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            console.log(`[SaratogaExtractor] Starting scrape for ${this.city}`);

            // Initialize browser and setup downloads using base class methods
            await this.initializeBrowser();
            const { downloadsDir, downloadPromise } = await this.setupDownloads();

            // Navigate to search page
            await this.navigateToSearchPage();

            // Format date for eTRAKiT (MM/DD/YYYY format)
            const dateStr = scrapeDate 
                ? this.formatDateForETRAKiT(scrapeDate)
                : this.formatDateForETRAKiT(new Date());

            console.log(`[SaratogaExtractor] Searching for permits with applied date: ${dateStr}`);

            // Set search filters using base class method
            await this.setSearchFilters(
                '#cplMain_ddSearchBy',  // Search By selector
                'APPLIED DATE',          // Search By value
                '#cplMain_ddSearchOper', // Search Operator selector
                'EQUALS',                // Search Operator value
                '#cplMain_txtSearchString', // Search Value selector
                dateStr                   // Search Value
            );

            // Execute search using base class method
            await this.executeSearch('#ctl00_cplMain_btnSearch');

            // Click export button and wait for download using base class method
            const excelFile = await this.clickExportButton(
                downloadPromise,
                downloadsDir,
                '#cplMain_btnExportToExcel' // Specific export button selector for Saratoga
            );

            // Parse Excel file (subclass-specific)
            const allPermits = await this.parseExcelFile(excelFile);

            // Apply limit if specified (for testing)
            const permits = limit && limit > 0 
                ? allPermits.slice(0, limit)
                : allPermits;
            
            if (limit && limit > 0) {
                console.log(`[SaratogaExtractor] Limited to ${permits.length} permits (from ${allPermits.length})`);
            }

            // Clean up downloaded file using base class method
            this.cleanupFiles(excelFile, downloadsDir);

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
            let workbook;
            let rows: any[][];
            
            if (filePath.endsWith('.csv')) {
                // For CSV files, parse manually to preserve original date strings
                // XLSX might convert date-like strings to Excel serial numbers
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
                workbook = XLSX.readFile(filePath);
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
                
                // Parse dates - use APPLIED DATE column for appliedDate/appliedDateString
                const appliedDateStr = this.getCellValue(row, columnMap.appliedDate);
                const expiredDateStr = this.getCellValue(row, columnMap.expiredDate);
                
                // Parse status from STATUS column (don't use ISSUED DATE)
                const statusStr = this.getCellValue(row, columnMap.status);
                
                let appliedDate: Date | undefined;
                let appliedDateString: string | undefined;
                let expirationDate: Date | undefined;
                let status: string | undefined;
                
                // Use APPLIED DATE column for appliedDate and appliedDateString
                if (appliedDateStr && String(appliedDateStr).trim() !== '') {
                    // Preserve the original string from CSV (e.g., "10/27/25" or "10/27/2025")
                    // Don't let it be converted to Excel serial number
                    let appliedDateStrValue: string;
                    
                    // If it's a number (Excel serial), convert it back to date string
                    if (typeof appliedDateStr === 'number') {
                        // Excel serial number - convert to date first
                        const date = this.parseDate(appliedDateStr);
                        if (date) {
                            // Format as MM/DD/YY to match CSV format
                            appliedDateStrValue = this.formatDateForETRAKiT(date);
                            // If original was 2-digit year, keep it that way
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
                
                // Use STATUS column directly and normalize it using eTRAKiT status normalizer
                if (statusStr && String(statusStr).trim() !== '') {
                    const rawStatus = String(statusStr).trim();
                    // Normalize the eTRAKiT status to our PermitStatus enum
                    const normalizedStatus = normalizeEtrakitStatus(rawStatus);
                    // Convert back to string for PermitData (will be mapped later in scraper.ts)
                    status = normalizedStatus;
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
                let city = "Saratoga";
                let state = "CA";
                let zipCode: string | undefined = undefined;
                
                if (address) {
                    // Address parsing - Saratoga CSV only provides street address
                    // No zip code is provided in the CSV export
                    const addrStr = address.toString().trim();
                    streetAddress = addrStr;
                    // zipCode remains undefined since it's not in the CSV
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
                    appliedDate,
                    appliedDateString,
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
     * Required by base class - but we parse Excel instead
     */
    protected async parsePermitData(rawData: any): Promise<PermitData[]> {
        // This shouldn't be called since we override scrape()
        // But if it is, return empty array
        return [];
    }
}

