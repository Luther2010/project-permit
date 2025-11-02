/**
 * Mountain View Extractor
 * Scrapes permit data from monthly PDF reports published by Mountain View
 */

import { BaseMonthlyExtractor } from "../base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";

export class MountainViewExtractor extends BaseMonthlyExtractor {
    protected browser: Browser | null = null;
    protected page: Page | null = null;
    private readonly baseUrl = "https://www.mountainview.gov/our-city/departments/community-development/building-fire-inspection/building-general-information/permit-history/-folder-637";

    /**
     * Normalize status string to PermitStatus enum
     */
    private normalizeStatus(status: string): PermitData["status"] {
        if (!status) return "UNKNOWN";
        
        const normalized = status.trim().toUpperCase();
        
        // Map common status values
        if (normalized.includes("ISSUED") || normalized.includes("ACTIVE")) {
            return "ISSUED";
        }
        if (normalized.includes("REVIEW") || normalized.includes("PENDING")) {
            return "IN_REVIEW";
        }
        if (normalized.includes("INACTIVE") || normalized.includes("VOID") || normalized.includes("CANCELLED")) {
            return "INACTIVE";
        }
        
        return "UNKNOWN";
    }

    /**
     * Parse date from various formats
     */
    private parseDate(dateStr: string): Date | undefined {
        if (!dateStr || !dateStr.trim()) return undefined;
        
        // Try various date formats
        const formats = [
            /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
            /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
            /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY (zero-padded)
        ];
        
        for (const format of formats) {
            const match = dateStr.match(format);
            if (match) {
                if (format === formats[0] || format === formats[2]) {
                    // MM/DD/YYYY
                    const month = parseInt(match[1], 10) - 1;
                    const day = parseInt(match[2], 10);
                    const year = parseInt(match[3], 10);
                    return new Date(year, month, day);
                } else if (format === formats[1]) {
                    // YYYY-MM-DD
                    const year = parseInt(match[1], 10);
                    const month = parseInt(match[2], 10) - 1;
                    const day = parseInt(match[3], 10);
                    return new Date(year, month, day);
                }
            }
        }
        
        // Try native Date parsing
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
        
        return undefined;
    }

    /**
     * Parse address from text
     */
    private parseAddress(addressStr: string): { address: string; city: string; zipCode: string | undefined } {
        if (!addressStr) {
            return { address: "", city: this.city, zipCode: undefined };
        }
        
        // Extract ZIP code (5 digits at end)
        const zipMatch = addressStr.match(/\b(\d{5})(?:-\d{4})?\b/);
        const zipCode = zipMatch ? zipMatch[1] : undefined;
        
        // Remove ZIP code from address
        const addressWithoutZip = addressStr.replace(/\s*\b\d{5}(?:-\d{4})?\b\s*$/, "").trim();
        
        return {
            address: addressWithoutZip || addressStr.trim(),
            city: this.city,
            zipCode,
        };
    }

    /**
     * Find PDF URL for a specific month/year
     */
    private async findPdfUrl(page: Page, targetDate: Date): Promise<string | null> {
        const targetMonth = targetDate.getMonth() + 1; // 1-12
        const targetYear = targetDate.getFullYear();
        
        // Navigate to the permit history page
        await page.goto(this.baseUrl, {
            waitUntil: "networkidle2",
            timeout: 60000,
        });
        
        await new Promise((resolve) => setTimeout(resolve, 3000));
        
        // Wait for content to load - check if there are any content_link elements
        try {
            await page.waitForSelector('a.content_link', { timeout: 10000 });
        } catch (e) {
            // Try waiting for any links
            await page.waitForSelector('a', { timeout: 5000 }).catch(() => {});
        }
        
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        // Find PDF links on the page
        const result = await page.evaluate((month: number, year: number) => {
            // @ts-expect-error - page.evaluate runs in browser context
            const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
            
            const allLinks: Array<{href: string, text: string}> = [];
            const pdfLinks: Array<{href: string, text: string}> = [];
            
            // Look for PDF links with the month/year pattern
            // Format might be like "09/2025" or "September 2025" or "Sept 2025"
            const monthNames = [
                'january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'
            ];
            const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
            
            const targetMonthName = monthNames[month - 1];
            const targetMonthAbbr = monthAbbr[month - 1];
            const targetMonthStr = String(month).padStart(2, '0');
            
            for (const link of links) {
                let href = link.href;
                const text = link.textContent?.trim() || '';
                
                // Convert relative URLs to absolute
                if (href.startsWith('/')) {
                    // @ts-expect-error - page.evaluate runs in browser context
                    href = `${window.location.origin}${href}`;
                }
                
                allLinks.push({ href, text });
                
                // Check if it's a PDF link (showpublisheddocument or .pdf)
                const isPdf = href.includes('showpublisheddocument') || href.endsWith('.pdf');
                
                if (isPdf) {
                    pdfLinks.push({ href, text });
                    
                    // Check if link text contains the target month/year
                    // Looking for patterns like "September 2025", "Sept 2025", "09/2025", etc.
                    const textLower = text.toLowerCase();
                    const hasMonthYear = (
                        text.includes(`${targetMonthStr}/${year}`) ||
                        text.includes(`${targetMonthStr}/${year.toString().slice(-2)}`) ||
                        text.includes(`${month}/${year}`) ||
                        text.includes(`${month}/${year.toString().slice(-2)}`) ||
                        textLower.includes(`${targetMonthName} ${year}`) ||
                        textLower.includes(`${targetMonthAbbr} ${year}`) ||
                        textLower.includes(`${targetMonthAbbr}. ${year}`) ||
                        // Also check for capitalized versions
                        text.includes(`${targetMonthName.charAt(0).toUpperCase() + targetMonthName.slice(1)} ${year}`) ||
                        text.includes(`${targetMonthAbbr.charAt(0).toUpperCase() + targetMonthAbbr.slice(1)} ${year}`)
                    );
                    
                    if (hasMonthYear) {
                        return { found: true, url: href, allLinks, pdfLinks };
                    }
                }
            }
            
            return { found: false, url: null, allLinks, pdfLinks };
        }, targetMonth, targetYear);
        
        return result.url;
    }

    /**
     * Download PDF and extract text using Puppeteer
     */
    private async downloadAndParsePdf(page: Page, pdfUrl: string): Promise<string> {
        // Use page.evaluate to download PDF via fetch (works in browser context)
        const pdfBuffer = await page.evaluate(async (url: string) => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch PDF: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            // Convert ArrayBuffer to base64 for transfer (chunked to avoid stack overflow)
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            // Build string character by character to avoid stack overflow
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        }, pdfUrl);
        
        // Convert base64 back to Buffer
        const buffer = Buffer.from(pdfBuffer, 'base64');
        
        // Verify it's a PDF
        if (buffer.length < 4 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
            throw new Error("Downloaded file is not a valid PDF");
        }
        
        // Use pdf-parse (CommonJS module)
        const pdfParse = require("pdf-parse");
        // pdf-parse v2.x exports PDFParse class, need to instantiate it
        const parser = new pdfParse.PDFParse({ data: buffer });
        const pdfData = await parser.getText();
        
        return pdfData.text;
    }

    /**
     * Parse permit data from PDF text
     * This is a flexible parser that tries to extract permit information
     * Adjust based on actual PDF structure
     */
    private parsePermitDataFromText(pdfText: string): PermitData[] {
        const permits: PermitData[] = [];
        const lines = pdfText.split('\n').map(line => line.trim()).filter(line => line);
        
        // PDF structure appears to have columns:
        // APN No. | T/W | Permit # | Permit Type | Permit Date | $ Valuation | Applicant Name / Phone | Contractor Name / Phone
        // Permit # is in format "2025-XXXX" (not the APN numbers like 14712063)
        
        // Look for permit number patterns in format "YYYY-XXXX" (e.g., "2025-3182")
        const permitNumberPattern = /\b(\d{4}-\d{4,6})\b/g;
        const permitMatches = Array.from(pdfText.matchAll(permitNumberPattern));
        
        // For each permit number found, extract a larger context to get full permit row
        for (const match of permitMatches) {
            const permitNumber = match[0];
            const matchIndex = match.index || 0;
            
            // Skip if this looks like a T/W permit number (appears in "T/W" column, usually right before main permit #)
            const beforeText = pdfText.substring(Math.max(0, matchIndex - 100), matchIndex);
            if (beforeText.includes('T/W') && beforeText.match(/T\/W\s+\d{4}-/)) {
                continue; // This is likely a T/W permit number, skip it
            }
            
            // Extract permit row: find the next permit number or description section to mark the end of this permit
            let rowEndIndex = matchIndex + 800; // Default: 800 chars after permit number
            const nextPermitMatch = pdfText.substring(matchIndex + 1).match(/\b(\d{4}-\d{4,6})\b/);
            if (nextPermitMatch && nextPermitMatch.index) {
                rowEndIndex = matchIndex + 1 + (nextPermitMatch.index || 0);
            }
            
            // Extract the permit row (from permit number to next permit or end)
            const permitRow = pdfText.substring(matchIndex, Math.min(pdfText.length, rowEndIndex));
            
            // Extract larger context for description and address (includes description section)
            const contextStart = Math.max(0, matchIndex - 500);
            const contextEnd = Math.min(pdfText.length, matchIndex + 1200);
            const context = pdfText.substring(contextStart, contextEnd);
            
            // Extract date (MM/DD/YYYY or MM/DD format) - should be in the permit row, after permit number
            // Look for date patterns: MM/DD/YYYY first, then MM/DD (year defaults to 2025 for monthly PDF)
            let appliedDate: Date | undefined;
            let appliedDateString: string | undefined;
            
            // Try MM/DD/YYYY format first
            const dateMatchesYYYY = Array.from(permitRow.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g));
            if (dateMatchesYYYY.length > 0) {
                const dateStr = dateMatchesYYYY[0][0];
                appliedDate = this.parseDate(dateStr);
                appliedDateString = dateStr;
            } else {
                // Try MM/DD format (year is assumed to be 2025 for permits in monthly PDF)
                const dateMatchesMMDD = Array.from(permitRow.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g));
                if (dateMatchesMMDD.length > 0) {
                    // Use the first date found (closest to permit number)
                    const month = parseInt(dateMatchesMMDD[0][1], 10);
                    const day = parseInt(dateMatchesMMDD[0][2], 10);
                    // Assume year is 2025 for monthly PDF
                    const dateStr = `${month}/${day}/2025`;
                    appliedDate = this.parseDate(dateStr);
                    appliedDateString = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`; // Store as MM/DD
                }
            }
            
            // Extract Valuation (look for $ followed by number with commas and decimals)
            // Should be in the permit row, typically after the date
            // Pattern: $1,234.56 or $1234.56
            // Find all valuations in the permit row and use the first one
            const valuationMatches = Array.from(permitRow.matchAll(/\$\s*([\d,]+\.?\d*)/g));
            let value: number | undefined;
            
            if (valuationMatches.length > 0) {
                // Use the first valuation found (closest to permit number in the row)
                const valuationStr = valuationMatches[0][1];
                const cleaned = valuationStr.replace(/,/g, '');
                const parsed = parseFloat(cleaned);
                if (!isNaN(parsed) && parsed > 0) {
                    value = parsed;
                }
            }
            
            // Extract Contractor Name
            // Look for "Contractor Name" label or contractor name in the context
            // Contractor name typically appears after applicant information
            // Pattern often looks like: "00 Company Name / /" or "Company Name / Phone"
            let contractorName: string | undefined;
            
            // Try to find "Contractor Name" label first
            const contractorLabelMatch = context.match(/Contractor\s+Name[:\s]*([^\n/]+?)(?:\s*\/|$|\n)/i);
            if (contractorLabelMatch) {
                contractorName = contractorLabelMatch[1].trim();
            } else {
                // Look for patterns like "00 Company Name / /" which often indicates contractor
                // The "00 " prefix seems to be used for contractor names in this PDF
                const contractorPattern00 = /00\s+([A-Z][A-Za-z0-9\s&.,'-]+?)\s*\/\s*\//i;
                const contractorMatch00 = context.match(contractorPattern00);
                if (contractorMatch00) {
                    contractorName = contractorMatch00[1].trim();
                } else {
                    // Try pattern without "00 " - company name followed by " / /" or " / Phone"
                    const contractorPattern = /([A-Z][A-Za-z0-9\s&.,'-]{5,}(?:\s+(?:Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co))?)\s*\/\s*(?:\/|\d)/i;
                    const contractorMatch = context.match(contractorPattern);
                    if (contractorMatch) {
                        const candidate = contractorMatch[1].trim();
                        // Make sure it's not an address (addresses have street types)
                        if (!candidate.match(/(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir|Place|Pl)\b/i)) {
                            // Make sure it's not just a number or very short
                            if (!candidate.match(/^\d+$/) && candidate.length >= 5) {
                                contractorName = candidate;
                            }
                        }
                    }
                }
            }
            
            // Additional cleanup
            if (contractorName) {
                // Remove leading/trailing slashes, spaces, and "00 " prefix
                contractorName = contractorName.replace(/^00\s+/, '').replace(/^\/+\s*|\s*\/+$/g, '').trim();
                // If it's empty or too short, clear it
                if (contractorName.length < 3 || contractorName.match(/^[\d\s\/-]+$/)) {
                    contractorName = undefined;
                }
            }
            
            // Extract Project Address
            // Address appears after "Project Address:" label (which may appear bold as **Project Address:**)
            // The address should be in the description section AFTER the permit number, not before it
            // Look for the "Project Address:" that appears closest to and after the permit number
            let addressStr = "";
            
            // Find the position of the permit number in context
            const permitNumberPosInContext = context.indexOf(permitNumber);
            
            // Look for "Project Address:" that appears AFTER the permit number in the description
            // The description typically comes after the main permit row data
            const afterPermitNumber = context.substring(permitNumberPosInContext);
            
            // Try to find "Project Address:" in the text after the permit number
            // Pattern: Project Address: or **Project Address:** followed by address
            // The address is on the same line or next line after "Project Address:"
            const projectAddressMatch = afterPermitNumber.match(/(?:\*\*)?Project\s+Address[:\s]+\*\*\s*([^\n]+?)(?:\n|$|Description|\d{4}-)/i);
            if (projectAddressMatch) {
                addressStr = projectAddressMatch[1].trim();
                // Clean up any remaining ** markers or extra spaces
                addressStr = addressStr.replace(/\*\*/g, '').trim();
            } else {
                // Fallback: Look for pattern without bold markers
                const projectAddressMatch2 = afterPermitNumber.match(/Project\s+Address[:\s]+([^\n]+?)(?:\n|$|Description|\d{4}-)/i);
                if (projectAddressMatch2) {
                    addressStr = projectAddressMatch2[1].trim();
                }
            }
            
            // If still no address found, the address might be in the permit row itself
            // Look for address pattern in the row data (before description)
            if (!addressStr) {
                // Address pattern: number + street name
                // It should be close to the permit number in the row
                const rowText = context.substring(Math.max(0, permitNumberPosInContext - 200), permitNumberPosInContext + 400);
                const addressInRow = rowText.match(/(\d{1,4}\s+\.?\s*[A-Z][A-Z\s]+(?:ST|STREET|AV|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|BLVD|BOULEVARD|CT|COURT|WAY|CIRCLE|CIR|PL|PLACE|PK|PARK)\s*[A-Z]*)/);
                if (addressInRow) {
                    addressStr = addressInRow[1].trim();
                }
            }
            
            const { address, city, zipCode } = this.parseAddress(addressStr);
            
            // Extract description (try to find "Description:" field)
            let description: string | undefined;
            const descMatch = context.match(/Description:\s*([^\n]+)/i);
            if (descMatch) {
                description = descMatch[1].trim();
            } else {
                // Fallback: use context but limit length
                description = context.substring(0, 200).trim();
            }
            
            // Extract permit type from description or type code
            // Type codes might be like "RF" (Reroofing), "OT" (Other), etc.
            // Also look for keywords in description
            const permitTypeKeywords = [
                'Residential', 'Commercial', 'Electrical', 'Plumbing', 'Mechanical',
                'Building', 'Demolition', 'Addition', 'Remodel', 'Solar', 'Pool',
                'Reroofing', 'Roofing', 'Roof', 'Window', 'Door', 'Fence'
            ];
            let permitType: string | undefined;
            
            // First check for explicit type codes (RF, OT, etc.)
            const typeCodeMatch = context.match(/\b([A-Z]{2})\s+\d{4}-/);
            if (typeCodeMatch) {
                const code = typeCodeMatch[1];
                // Map codes to types (we can expand this)
                const codeMap: Record<string, string> = {
                    'RF': 'ROOFING',
                    'OT': 'OTHER',
                    'BL': 'BUILDING',
                    'EL': 'ELECTRICAL',
                    'PL': 'PLUMBING',
                    'ME': 'MECHANICAL',
                };
                permitType = codeMap[code];
            }
            
            // If no code match, look for keywords
            if (!permitType) {
                for (const keyword of permitTypeKeywords) {
                    if (context.toLowerCase().includes(keyword.toLowerCase())) {
                        permitType = keyword.toUpperCase();
                        break;
                    }
                }
            }
            
            const permit: PermitData = {
                permitNumber,
                title: undefined,
                description,
                address,
                city: city || this.city,
                state: this.state,
                zipCode,
                permitType: permitType as any,
                status: "ISSUED", // All permits in monthly PDF reports are issued permits
                value,
                appliedDate,
                appliedDateString,
                sourceUrl: this.url,
                licensedProfessionalText: contractorName, // Store contractor name
            };
            
            if (this.validatePermitData(permit)) {
                permits.push(permit);
            }
        }
        
        return permits;
    }

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            // Launch browser
            this.browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1920, height: 1080 });
            
            // Set user agent and headers to avoid access denied
            await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await this.page.setExtraHTTPHeaders({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            });

            // Get month and year from scrapeDate (defaults to current month)
            const { month, year } = this.getMonthYear(scrapeDate);
            const targetDate = new Date(year, month - 1, 1); // First day of target month

            // Find the PDF URL for the target month
            const pdfUrl = await this.findPdfUrl(this.page, targetDate);
            
            if (!pdfUrl) {
                throw new Error(`Could not find PDF for ${targetDate.getMonth() + 1}/${targetDate.getFullYear()}`);
            }

            // Download and parse PDF using Puppeteer (handles cookies automatically)
            const pdfText = await this.downloadAndParsePdf(this.page, pdfUrl);

            // Parse permit data from PDF text
            let permits = this.parsePermitDataFromText(pdfText);

            // Apply limit if specified
            if (limit && permits.length > limit) {
                permits = permits.slice(0, limit);
            }

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            console.error(`[MountainViewExtractor] Error during scrape:`, error);
            return {
                permits: [],
                success: false,
                error: error.message || "Unknown error",
                scrapedAt: new Date(),
            };
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    protected async parsePermitData(rawData: any, limit?: number): Promise<PermitData[]> {
        // This method is called by the base class, but we handle parsing in scrape()
        // Return empty array as parsing is done in scrape()
        return [];
    }
}

