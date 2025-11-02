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
        
        // Debug: Check page content
        const pageInfo = await page.evaluate(() => {
            return {
                // @ts-expect-error - page.evaluate runs in browser context
                title: document.title,
                // @ts-expect-error - page.evaluate runs in browser context
                url: window.location.href,
                // @ts-expect-error - page.evaluate runs in browser context
                bodyText: document.body.innerText.substring(0, 500),
                // @ts-expect-error - page.evaluate runs in browser context
                linkCount: document.querySelectorAll('a').length,
                // @ts-expect-error - page.evaluate runs in browser context
                contentLinkCount: document.querySelectorAll('a.content_link').length,
            };
        });
        console.log(`[MountainViewExtractor] Page info:`, pageInfo);
        
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
        
        if (!result.found && result.pdfLinks.length > 0) {
            console.log(`[MountainViewExtractor] Found ${result.pdfLinks.length} PDF links but none match ${targetMonth}/${targetYear}:`);
            result.pdfLinks.slice(0, 10).forEach(link => {
                console.log(`  - "${link.text}" -> ${link.href}`);
            });
        } else if (result.pdfLinks.length === 0) {
            console.log(`[MountainViewExtractor] Found ${result.allLinks.length} total links, ${result.pdfLinks.length} PDF links`);
        }
        
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
        
        // This is a placeholder parser - we'll need to adjust based on actual PDF structure
        // Common patterns to look for:
        // - Permit numbers (e.g., "BLD-2025-1234" or "2025-1234")
        // - Dates (MM/DD/YYYY format)
        // - Addresses
        // - Permit types
        
        // Try to find permit entries
        // Look for permit number patterns
        const permitNumberPattern = /\b(BLD-)?\d{4}-?\d{4,6}\b/gi;
        const permitMatches = Array.from(pdfText.matchAll(permitNumberPattern));
        
        // For each permit number found, try to extract surrounding information
        for (const match of permitMatches) {
            const permitNumber = match[0].replace(/^BLD-/, ''); // Remove BLD- prefix if present
            const matchIndex = match.index || 0;
            
            // Extract context around the permit number (100 chars before and after)
            const start = Math.max(0, matchIndex - 100);
            const end = Math.min(pdfText.length, matchIndex + 200);
            const context = pdfText.substring(start, end);
            
            // Try to extract date (look for MM/DD/YYYY near the permit number)
            const dateMatch = context.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
            const appliedDate = dateMatch ? this.parseDate(dateMatch[0]) : undefined;
            const appliedDateString = dateMatch ? dateMatch[0] : undefined;
            
            // Try to extract address (look for common address patterns)
            // This is simplified - actual parsing will need to be more sophisticated
            const addressPattern = /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir)/i;
            const addressMatch = context.match(addressPattern);
            const addressStr = addressMatch ? addressMatch[0] : "";
            const { address, city, zipCode } = this.parseAddress(addressStr);
            
            // Try to extract permit type (look for keywords)
            const permitTypeKeywords = [
                'Residential', 'Commercial', 'Electrical', 'Plumbing', 'Mechanical',
                'Building', 'Demolition', 'Addition', 'Remodel', 'Solar', 'Pool'
            ];
            let permitType: string | undefined;
            for (const keyword of permitTypeKeywords) {
                if (context.toLowerCase().includes(keyword.toLowerCase())) {
                    permitType = keyword;
                    break;
                }
            }
            
            const permit: PermitData = {
                permitNumber,
                title: undefined,
                description: context.substring(0, 200).trim(), // Use context as description for now
                address,
                city,
                state: this.state,
                zipCode,
                permitType: permitType as any,
                status: "UNKNOWN", // PDF might not have status
                appliedDate,
                appliedDateString,
                sourceUrl: this.url,
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

