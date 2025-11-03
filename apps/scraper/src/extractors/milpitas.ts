/**
 * Milpitas Extractor implementation
 * Uses Puppeteer to interact with eTRAKiT platform
 * Searches by permit number prefix in batches (cannot search by date)
 * Clicks into detail pages to extract full permit information
 */

import { EtrakitIdBasedExtractor } from "./etrakit-id-based-extractor";
import { PermitData, ScrapeResult } from "../types";
import { normalizeEtrakitStatus } from "../utils/etrakit-status";

export class MilpitasExtractor extends EtrakitIdBasedExtractor {
    /**
     * Normalize status using eTRAKiT status normalizer
     */
    private normalizeStatus(rawStatus: string): string {
        return normalizeEtrakitStatus(rawStatus);
    }
    /**
     * Base permit prefixes without year suffix
     * Examples: "B-AC", "B-AM", etc.
     * Format: permit numbers are like "prefix-0001", "prefix-0002", etc.
     */
    private readonly BASE_PREFIXES = [
        "B-AC",
        "B-AM",
        "B-BP",
        "B-DF",
        "B-DM",
        "B-EL",
        "B-ES",
        "B-EV",
        "B-FO",
        "B-GR",
        "B-IR",
        "B-ME",
        "B-MH",
        "B-MU",
        "B-OC",
        "B-OT",
        "B-PA",
        "B-PL",
        "B-PS",
        "B-RR",
        "B-RV",
        "B-RW",
        "B-SG",
        "B-SI",
        "B-SO",
        "B-SW",
        "B-TP",
        "B-TS",
        "B-UH",
        "B-WP",
        "E-EN",
        // Add more prefixes as needed
    ];

    /**
     * Get permit prefixes with dynamic year suffix (2-digit)
     * Uses scrapeDate if provided, otherwise current year
     */
    private getPermitPrefixes(scrapeDate?: Date): string[] {
        const year = scrapeDate ? scrapeDate.getFullYear() : new Date().getFullYear();
        const yearSuffix = String(year).slice(-2); // Last 2 digits (e.g., "25" for 2025)
        return this.BASE_PREFIXES.map(prefix => `${prefix}${yearSuffix}`);
    }

    /**
     * Maximum number of results per search batch (20 pages × 5 entries/page = 100)
     */
    private readonly MAX_RESULTS_PER_BATCH = 100;

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            console.log(`[MilpitasExtractor] Starting scrape for ${this.city}`);

            // Initialize browser
            await this.initializeBrowser();

            // Navigate to search page
            await this.navigateToSearchPage();

            const allPermits: PermitData[] = [];

            // Get permit prefixes with dynamic year
            const permitPrefixes = this.getPermitPrefixes(scrapeDate);

            // Search for each prefix
            for (const prefix of permitPrefixes) {
                console.log(`[MilpitasExtractor] Searching for prefix: ${prefix}`);

                // Search in batches: prefix-00, prefix-01, prefix-02, etc.
                let batchNumber = 0;
                let hasMoreBatches = true;

                while (hasMoreBatches) {
                    // Format batch search string: prefix-00, prefix-01, etc.
                    const batchSuffix = String(batchNumber).padStart(2, "0");
                    const searchValue = `${prefix}-${batchSuffix}`;

                    console.log(`[MilpitasExtractor] Searching batch: ${searchValue}`);

                    // Set up search filters
                    await this.setSearchFilters(
                        '#cplMain_ddSearchBy',        // Search By selector
                        'Permit Number',              // Search By value (exact match from dropdown)
                        '#cplMain_ddSearchOper',      // Search Operator selector
                        'BEGINS WITH',                // Search Operator value (changed from CONTAINS to BEGINS WITH)
                        '#cplMain_txtSearchString',   // Search Value selector
                        searchValue                   // Search Value (e.g., "25-00", "B-AC25-00")
                    );

                    // Execute search - Milpitas uses #cplMain_btnSearch (not #ctl00_cplMain_btnSearch)
                    await this.executeSearch('#cplMain_btnSearch');

                    // Check how many results we got
                    const resultCount = await this.getResultCount();
                    console.log(`[MilpitasExtractor] Found ${resultCount} results for ${searchValue}`);

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
                        console.log(`[MilpitasExtractor] Reached limit of ${limit} permits`);
                        allPermits.splice(limit);
                        hasMoreBatches = false;
                        break; // Break out of batch loop
                    }

                    // If we got exactly MAX_RESULTS_PER_BATCH results, there might be more
                    // Continue to next batch (prefix-01, prefix-02, etc.)
                    if (resultCount >= this.MAX_RESULTS_PER_BATCH) {
                        batchNumber++;
                        console.log(`[MilpitasExtractor] Got ${resultCount} results (max), checking next batch...`);
                    } else {
                        // Got fewer than max results, we've covered all permits for this prefix
                        hasMoreBatches = false;
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
                console.log(`[MilpitasExtractor] Limited to ${permits.length} permits (from ${allPermits.length})`);
            }

            console.log(`[MilpitasExtractor] Extracted ${permits.length} permits total`);

            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error) {
            console.error(`[MilpitasExtractor] Error:`, error);
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
     * Extract data from the Permit Info tab
     * Milpitas-specific override: uses specific element IDs for better reliability
     */
    protected async extractPermitInfoTab(): Promise<Partial<PermitData>> {
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
        
        // Short Description -> title
        data.title = await getSpanText('cplMain_ctl02_lblPermitDesc');
        // Notes -> description
        data.description = await getSpanText('cplMain_ctl02_lblPermitNotes');
        // Status -> status
        data.status = await getSpanText('cplMain_ctl02_lblPermitStatus');
        data.appliedDate = await getSpanText('cplMain_ctl02_lblPermitAppliedDate');
        data.approvedDate = await getSpanText('cplMain_ctl02_lblPermitApprovedDate');
        data.issuedDate = await getSpanText('cplMain_ctl02_lblPermitIssuedDate');
        data.finaledDate = await getSpanText('cplMain_ctl02_lblPermitFinaledDate');
        data.expirationDate = await getSpanText('cplMain_ctl02_lblPermitExpirationDate');

        // Normalize status
        if (data.status) {
            data.status = this.normalizeStatus(data.status);
        }

        return data;
    }

    // getPermitRows is already correctly implemented in base class to handle both rgRow and rgAltRow

    /**
     * Override extractSiteInfoTab to use Milpitas-specific element IDs
     */
    protected async extractSiteInfoTab(): Promise<Partial<PermitData>> {
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

        // Get address from the link (cplMain_ctl03_hlSiteAddress)
        // The link text contains the address, but we need to clean it up (remove the map icon text if present)
        let address: string | undefined;
        try {
            const addressElement = await this.page!.$('#cplMain_ctl03_hlSiteAddress');
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

        // Get zip code from City/State/Zip field (cplMain_ctl03_lblSiteCityStateZip)
        // Format: "MILPITAS, CA, 95035"
        let zipCode: string | undefined;
        try {
            const cityStateZipText = await getElementText('cplMain_ctl03_lblSiteCityStateZip');
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
     * Override navigatePagesAndExtract to click into permit detail pages
     */
    protected async navigatePagesAndExtract(limit?: number): Promise<PermitData[]> {
        const allPermits: PermitData[] = [];
        let pageNum = 1;
        const maxPages = 20; // eTRAKiT typically limits to 20 pages

        while (pageNum <= maxPages) {
            console.log(`[MilpitasExtractor] Processing page ${pageNum}...`);

            // Get all permit rows on current page
            const rows = await this.getPermitRows();
            
            if (rows.length === 0) {
                console.log(`[MilpitasExtractor] No more rows found on page ${pageNum}`);
                break;
            }

            // Process each permit on this page
            for (const row of rows) {
                if (limit && allPermits.length >= limit) {
                    console.log(`[MilpitasExtractor] Reached limit of ${limit} permits`);
                    return allPermits;
                }

                if (!row.permitNumber) {
                    continue;
                }

                console.log(`[MilpitasExtractor] Extracting permit: ${row.permitNumber}`);

                // Extract permit detail
                try {
                    const permitData = await this.extractPermitDetail(row.permitNumber);
                    if (permitData) {
                        allPermits.push(permitData);
                        console.log(`[MilpitasExtractor] Extracted permit ${row.permitNumber}`);
                    }
                } catch (e: any) {
                    console.warn(`[MilpitasExtractor] Error extracting permit ${row.permitNumber}: ${e?.message || e}`);
                }

                // Navigate back to search results
                await this.navigateBackToResults();
            }

            // Check if there's a next page
            // Milpitas uses input buttons with specific IDs: ctl00_cplMain_rgSearchRslts_ctl00_ctl03_ctl01_btnPageNext
            const hasNextPage = await this.page!.evaluate(() => {
                // Look for NextPage button by ID pattern or class
                const nextBtn = (globalThis as any).document.querySelector('input.PagerButton.NextPage, input[id*="btnPageNext"]') as any;
                if (nextBtn) {
                    return !nextBtn.disabled && !nextBtn.classList.contains('aspNetDisabled');
                }
                
                // Fallback: look for ">" text in pagination
                const pagerCells = Array.from((globalThis as any).document.querySelectorAll('td')) as any[];
                for (const cell of pagerCells) {
                    const nextLink = cell.querySelector('input[onclick*="changePage"], input[onclick*="Page"]');
                    if (nextLink && nextLink.classList.contains('NextPage') && !nextLink.disabled) {
                        return true;
                    }
                }
                
                return false;
            });

            if (!hasNextPage) {
                console.log(`[MilpitasExtractor] No more pages`);
                break;
            }

            // Click next page button
            const clicked = await this.page!.evaluate(() => {
                // Look for NextPage button by class or ID pattern
                const nextBtn = (globalThis as any).document.querySelector('input.PagerButton.NextPage, input[id*="btnPageNext"]') as any;
                if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('aspNetDisabled')) {
                    nextBtn.click();
                    return true;
                }
                
                // Fallback: find by onclick attribute
                const allButtons = Array.from((globalThis as any).document.querySelectorAll('input[type="submit"]')) as any[];
                const nextButton = allButtons.find((btn: any) => {
                    const onclick = btn.getAttribute('onclick') || '';
                    return onclick.includes('changePage') && onclick.includes('next') && !btn.disabled;
                });
                if (nextButton) {
                    nextButton.click();
                    return true;
                }
                
                return false;
            });

            if (!clicked) {
                console.warn(`[MilpitasExtractor] Could not find/click next page button`);
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 3000));
            pageNum++;
        }

        return allPermits;
    }
}

