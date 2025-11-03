import { EtrakitIdBasedExtractor } from "./etrakit-id-based-extractor";
import { PermitData, ScrapeResult } from "../types";
import { normalizeEtrakitStatus } from "../utils/etrakit-status";

export class MorganHillExtractor extends EtrakitIdBasedExtractor {
    getName(): string {
        return "MorganHillExtractor";
    }

    /**
     * Base permit prefixes without year suffix
     */
    protected readonly BASE_PREFIXES = [
        "BCOM",
        "BRES",
        "ELEC",
        "ENC",
        "FIRE",
        "GRD",
        "IR",
        "MECH",
        "MST",
        "OCC",
        "OSOW",
        "PLMG",
        "SOLR",
        "SPEC",
    ];

    /**
     * Get permit prefixes with dynamic year suffix (4-digit)
     * Uses scrapeDate if provided, otherwise current year
     */
    protected getPermitPrefixes(scrapeDate?: Date): string[] {
        const year = scrapeDate ? scrapeDate.getFullYear() : new Date().getFullYear();
        return this.BASE_PREFIXES.map(prefix => `${prefix}${year}`);
    }

    protected readonly MAX_RESULTS_PER_BATCH = 10; // 5 pages × 10 results per page = 50 max, but we use 3-digit suffixes to get 10 per batch

    /**
     * Normalize status using eTRAKiT status normalizer
     */
    private normalizeStatus(rawStatus: string): string {
        return normalizeEtrakitStatus(rawStatus);
    }

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            console.log(`[MorganHillExtractor] Starting scrape for ${this.city}`);

            // Initialize browser
            await this.initializeBrowser();

            // Navigate to search page
            await this.navigateToSearchPage();

            const allPermits: PermitData[] = [];

            // Get permit prefixes with dynamic year
            const permitPrefixes = this.getPermitPrefixes(scrapeDate);

            // Search for each prefix
            for (const prefix of permitPrefixes) {
                console.log(`[MorganHillExtractor] Searching for prefix: ${prefix}`);

                // Search in batches: prefix-000, prefix-001, prefix-002, etc.
                // Morgan Hill only returns 5 pages × 10 per page = 50 results max
                // So we need 3-digit suffixes to cover smaller ranges: -000 covers 0001-0010, -001 covers 0011-0020, etc.
                let batchNumber = 0;
                let hasMoreBatches = true;

                while (hasMoreBatches) {
                    // Format batch search string: prefix-000, prefix-001, etc.
                    const batchSuffix = String(batchNumber).padStart(3, "0");
                    const searchValue = `${prefix}-${batchSuffix}`;

                    console.log(`[MorganHillExtractor] Searching batch: ${searchValue}`);

                    // Set up search filters
                    // Note: Dropdown option text is "Permit#" and value is "Permit_Main.PERMIT_NO"
                    // It's already selected by default, so setDropdownValue should handle it
                    await this.setSearchFilters(
                        '#cplMain_ddSearchBy',        // Search By selector
                        'Permit#',                    // Search By value (matches option text)
                        '#cplMain_ddSearchOper',      // Search Operator selector
                        'BEGINS WITH',                // Search Operator value
                        '#cplMain_txtSearchString',   // Search Value selector
                        searchValue                   // Search Value (e.g., "BCOM2025-00")
                    );

                    // Execute search - Morgan Hill uses #ctl00_cplMain_btnSearch
                    await this.executeSearch('#ctl00_cplMain_btnSearch');

                    // Check how many results we got
                    const resultCount = await this.getResultCount();
                    console.log(`[MorganHillExtractor] Found ${resultCount} results for ${searchValue}`);

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
                        console.log(`[MorganHillExtractor] Reached limit of ${limit} permits`);
                        allPermits.splice(limit);
                        hasMoreBatches = false;
                        break;
                    }

                    // With 3-digit suffixes, each batch covers ~10 permits (e.g., -000 covers 0001-0010)
                    // Continue to next batch if we got any results
                    // Stop if we get 0 results (no more permits for this prefix)
                    if (resultCount > 0) {
                        batchNumber++;
                        console.log(`[MorganHillExtractor] Got ${resultCount} results, checking next batch...`);
                    } else {
                        // Got no results, we've covered all permits for this prefix
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
                console.log(`[MorganHillExtractor] Limited to ${permits.length} permits (from ${allPermits.length})`);
            }

            console.log(`[MorganHillExtractor] Extracted ${permits.length} permits total`);
            return {
                permits,
                success: true,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            console.error(`[MorganHillExtractor] Error during scrape:`, error);
            return {
                permits: [],
                success: false,
                error: error?.message || String(error),
                scrapedAt: new Date(),
            };
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Extract data from the Permit Info tab
     * Morgan Hill-specific: extract "Work Description" as description, leave title blank
     * Note: Morgan Hill uses ctl07 instead of ctl02 for Permit Info tab
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
        
        // Work Description -> description (no title)
        // Morgan Hill uses cplMain_ctl07_lblPermitDesc (not cplMain_ctl02_lblWorkDesc)
        data.description = await getSpanText('cplMain_ctl07_lblPermitDesc');
        // Status -> status
        data.status = await getSpanText('cplMain_ctl07_lblPermitStatus');
        data.appliedDate = await getSpanText('cplMain_ctl07_lblPermitAppliedDate');
        data.approvedDate = await getSpanText('cplMain_ctl07_lblPermitApprovedDate');
        data.issuedDate = await getSpanText('cplMain_ctl07_lblPermitIssuedDate');
        data.finaledDate = await getSpanText('cplMain_ctl07_lblPermitFinaledDate');
        data.expirationDate = await getSpanText('cplMain_ctl07_lblPermitExpirationDate');

        // Normalize status
        if (data.status) {
            data.status = this.normalizeStatus(data.status);
        }

        return data;
    }

    /**
     * Override extractPermitDetail to skip Contacts tab (Morgan Hill doesn't have it)
     * @param permitNumber - The permit number to extract
     * @param contractorFromTable - Optional contractor name extracted from search results table
     */
    protected async extractPermitDetail(permitNumber: string, contractorFromTable?: string): Promise<PermitData | null> {
        // Click on the permit row to navigate to detail page
        const clicked = await this.clickPermitRow(permitNumber);
        if (!clicked) {
            console.warn(`[${this.getName()}] Could not find permit row for ${permitNumber}`);
            return null;
        }

        // Verify we're on the detail page by checking for expected elements
        // Morgan Hill uses ctl07 for Permit Info tab
        try {
            await this.page!.waitForSelector('#cplMain_ctl07_lblPermitType, #cplMain_ctl07_lblPermitStatus', { timeout: 5000 });
        } catch (e) {
            console.warn(`[${this.getName()}] Detail page may not have loaded for ${permitNumber}`);
        }

        // Start with basic permit data
        const permitData: Partial<PermitData> = {
            permitNumber,
            city: this.city,
            state: this.state,
            sourceUrl: this.url,
            // Use contractor from table if available
            licensedProfessionalText: contractorFromTable || undefined,
        };

        try {
            // Extract from Permit Info tab (default tab)
            const permitInfo = await this.extractPermitInfoTab();
            Object.assign(permitData, permitInfo);

            // Skip Contacts tab - Morgan Hill doesn't have it
            // (We already have contractor from table if it was available)

            // Extract from Site Info tab
            const siteInfoClicked = await this.clickTab('Site Info');
            if (siteInfoClicked) {
                const siteInfo = await this.extractSiteInfoTab();
                Object.assign(permitData, siteInfo);
            }
        } catch (e: any) {
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
            // Already normalized in extractPermitInfoTab
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
     * Override navigatePagesAndExtract to handle Morgan Hill's pagination structure
     * Morgan Hill uses input buttons with class "PagerButton NextPage" and onclick="changePage('next'); return false;"
     */
    protected async navigatePagesAndExtract(limit?: number): Promise<PermitData[]> {
        const allPermits: PermitData[] = [];
        let pageNum = 1;
        const maxPages = 50; // Safety limit

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

                // Extract permit detail
                try {
                    // Pass contractor info from table if available
                    // extractPermitDetail will use table contractor if provided
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

            // Check if there's a next page
            // Morgan Hill uses input buttons with class "PagerButton NextPage" and ID pattern btnPageNext
            const hasNextPage = await this.page!.evaluate(() => {
                // Look for NextPage button by class or ID pattern
                const nextBtn = (globalThis as any).document.querySelector('input.PagerButton.NextPage, input[id*="btnPageNext"]') as any;
                if (nextBtn) {
                    return !nextBtn.disabled && !nextBtn.classList.contains('aspNetDisabled');
                }
                
                // Fallback: look for buttons with onclick containing "changePage"
                const allInputs = Array.from((globalThis as any).document.querySelectorAll('input[onclick*="changePage"]')) as any[];
                for (const input of allInputs) {
                    if (input.classList.contains('NextPage') && !input.disabled && !input.classList.contains('aspNetDisabled')) {
                        return true;
                    }
                }
                
                return false;
            });

            if (!hasNextPage) {
                console.log(`[${this.getName()}] No more pages`);
                break;
            }

            // Click next page button using Puppeteer's native click
            const clicked = await this.page!.evaluate(() => {
                // Try to find and click the NextPage button
                const nextBtn = (globalThis as any).document.querySelector('input.PagerButton.NextPage:not(.aspNetDisabled), input[id*="btnPageNext"]:not(.aspNetDisabled)') as any;
                if (nextBtn && !nextBtn.disabled) {
                    nextBtn.click();
                    return true;
                }
                return false;
            });

            if (!clicked) {
                // Fallback: try using Puppeteer's native click
                try {
                    const nextButton = await this.page!.$('input.PagerButton.NextPage:not(.aspNetDisabled), input[id*="btnPageNext"]:not(.aspNetDisabled)');
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

            // Wait for page to load
            await new Promise((resolve) => setTimeout(resolve, 3000));
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
     * Override extractSiteInfoTab to use Morgan Hill-specific element IDs
     * Note: Morgan Hill uses ctl08 instead of ctl03 for Site Info tab
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

        // Get address from the link (cplMain_ctl08_hlSiteAddress)
        let address: string | undefined;
        try {
            const addressElement = await this.page!.$('#cplMain_ctl08_hlSiteAddress');
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

        // Get zip code from City/State/Zip field (cplMain_ctl08_lblSiteCityStateZip)
        // Format: "MORGAN HILL, CA, 95037"
        let zipCode: string | undefined;
        try {
            const cityStateZipText = await getElementText('cplMain_ctl08_lblSiteCityStateZip');
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

        // Get Property Type (cplMain_ctl08_lblPropertyType)
        let propertyType: string | undefined;
        try {
            const propertyTypeText = await getElementText('cplMain_ctl08_lblPropertyType');
            if (propertyTypeText) {
                // Normalize property type (e.g., "ADDRESS" might need mapping)
                propertyType = propertyTypeText.toUpperCase();
            }
        } catch (e) {
            // Ignore errors
        }

        return {
            address: address || undefined,
            zipCode: zipCode || undefined,
            // Property type will be handled separately if needed
        };
    }
}

