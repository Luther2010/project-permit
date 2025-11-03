import { EtrakitIdBasedExtractor } from "./etrakit-id-based-extractor";
import { PermitData, ScrapeResult } from "../types";
import { normalizeEtrakitStatus } from "../utils/etrakit-status";

export class LosAltosExtractor extends EtrakitIdBasedExtractor {
    getName(): string {
        return "LosAltosExtractor";
    }

    protected readonly PERMIT_PREFIXES = [
        "ADR25",
        "BLD25",
        "E25",
        "LC25",
        "ONBLD25",
        "PAADU25",
        "PRADU25",
        "PS25",
        "SE25",
        "SOLAR25",
        "SWO25",
        "TP25",
        "X25",
    ];

    protected readonly MAX_RESULTS_PER_BATCH = 100; // Conservative estimate

    /**
     * Normalize status using eTRAKiT status normalizer
     */
    private normalizeStatus(rawStatus: string): string {
        return normalizeEtrakitStatus(rawStatus);
    }

    async scrape(scrapeDate?: Date, limit?: number): Promise<ScrapeResult> {
        try {
            console.log(`[LosAltosExtractor] Starting scrape for ${this.city}`);

            // Initialize browser
            await this.initializeBrowser();

            // Navigate to search page
            await this.navigateToSearchPage();

            const allPermits: PermitData[] = [];

            // Search for each prefix
            for (const prefix of this.PERMIT_PREFIXES) {
                console.log(`[LosAltosExtractor] Searching for prefix: ${prefix}`);

                // Search in batches: prefix-00, prefix-01, etc. (each batch covers 00001-00999)
                let batchNumber = 0;
                let hasMoreBatches = true;

                while (hasMoreBatches) {
                    // Format batch search string: prefix-00, prefix-01, etc.
                    // This will match permits like prefix-00001, prefix-00002, ..., prefix-00999
                    const batchSuffix = String(batchNumber).padStart(2, "0");
                    const searchValue = `${prefix}-${batchSuffix}`;

                    console.log(`[LosAltosExtractor] Searching batch: ${searchValue}`);

                    // Set up search filters
                    await this.setSearchFilters(
                        '#cplMain_ddSearchBy',        // Search By selector
                        'Permit_Main.PERMIT_NO',     // Search By value (option value)
                        '#cplMain_ddSearchOper',     // Search Operator selector
                        'BEGINS WITH',                // Search Operator value
                        '#cplMain_txtSearchString',  // Search Value selector
                        searchValue                   // Search Value (e.g., "BLD25-00001")
                    );

                    // Execute search - try both possible selectors
                    await this.executeSearch('#ctl00_cplMain_btnSearch, #cplMain_btnSearch');

                    // Check how many results we got
                    const resultCount = await this.getResultCount();
                    console.log(`[LosAltosExtractor] Found ${resultCount} results for ${searchValue}`);

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
                        console.log(`[LosAltosExtractor] Reached limit of ${limit} permits`);
                        allPermits.splice(limit);
                        hasMoreBatches = false;
                        break;
                    }

                    // If we got exactly MAX_RESULTS_PER_BATCH results, there might be more
                    // Otherwise, move to next prefix
                    if (batchPermits.length < this.MAX_RESULTS_PER_BATCH) {
                        hasMoreBatches = false;
                    }

                    batchNumber++;
                }

                // Check limit after each prefix
                if (limit && allPermits.length >= limit) {
                    break;
                }
            }

            console.log(`[LosAltosExtractor] Scraped ${allPermits.length} permits total`);

            return {
                permits: allPermits,
                success: true,
                error: undefined,
                scrapedAt: new Date(),
            };
        } catch (error: any) {
            console.error(`[LosAltosExtractor] Error during scrape: ${error?.message || error}`);
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
     * Override extractPermitInfoTab for Los Altos
     * Los Altos uses cplMain_ctl07_* element IDs (same as Morgan Hill)
     */
    protected async extractPermitInfoTab(): Promise<Partial<PermitData>> {
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
        
        // Los Altos has Type, Subtype, Description, Status, and dates
        data.title = await getSpanText('cplMain_ctl07_lblPermitType'); // Type as title
        const subtype = await getSpanText('cplMain_ctl07_lblPermitSubtype');
        const description = await getSpanText('cplMain_ctl07_lblPermitDesc');
        
        // Combine subtype and description if both exist
        if (subtype && description) {
            data.description = `${subtype}: ${description}`;
        } else {
            data.description = subtype || description || undefined;
        }
        
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
     * Override extractSiteInfoTab for Los Altos
     * Los Altos uses cplMain_ctl08_* element IDs (same as Morgan Hill)
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

        let address: string | undefined;
        try {
            const addressElement = await this.page!.$('#cplMain_ctl08_hlSiteAddress');
            if (addressElement) {
                const addressText = await this.page!.evaluate((el: any) => {
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

        let zipCode: string | undefined;
        try {
            const cityStateZipText = await getElementText('cplMain_ctl08_lblSiteCityStateZip');
            if (cityStateZipText) {
                const zipMatch = cityStateZipText.match(/\b(\d{5})\b/);
                if (zipMatch) {
                    zipCode = zipMatch[1];
                }
            }
        } catch (e) {
            // Ignore errors
        }

        let propertyType: string | undefined;
        try {
            const propertyTypeText = await getElementText('cplMain_ctl08_lblPropertyType');
            if (propertyTypeText) {
                propertyType = propertyTypeText.toUpperCase();
            }
        } catch (e) {
            // Ignore errors
        }

        // Note: propertyType is not in PermitData interface, so we skip it
        return {
            address: address || undefined,
            zipCode: zipCode || undefined,
        };
    }

    /**
     * Override extractPermitDetail to skip Contacts tab (Los Altos doesn't have it)
     * Also fix the wait selector to use ctl07 instead of ctl02
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
        // Los Altos uses ctl07 for Permit Info tab
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

            // Skip Contacts tab - Los Altos doesn't have it
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
     * Override navigatePagesAndExtract to handle Los Altos's pagination structure
     * Los Altos uses input buttons with class "PagerButton NextPage" and onclick="changePage('next'); return false;"
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

                // Navigate back to results page
                await this.navigateBackToResults();
            }

            // Check if there's a next page
            // Los Altos uses changePage('next') function with buttons
            const hasNextPage = await this.page!.evaluate(() => {
                const nextBtn = (globalThis as any).document.querySelector('input.PagerButton.NextPage:not(.aspNetDisabled)') as any;
                if (nextBtn && !nextBtn.disabled) {
                    return true;
                }
                return false;
            });

            if (!hasNextPage) {
                console.log(`[${this.getName()}] No more pages`);
                break;
            }

            // Click next page button
            try {
                const nextButton = await this.page!.$('input.PagerButton.NextPage:not(.aspNetDisabled)');
                if (nextButton) {
                    await nextButton.click();
                    // Wait for page to load
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    // Wait for results table
                    try {
                        await this.page!.waitForSelector('tr.rgRow, tr.rgAltRow', { timeout: 10000 });
                    } catch (e) {
                        console.warn(`[${this.getName()}] Timeout waiting for results after page change`);
                    }
                } else {
                    console.log(`[${this.getName()}] Could not find next page button`);
                    break;
                }
            } catch (e: any) {
                console.warn(`[${this.getName()}] Error clicking next page: ${e?.message || e}`);
                break;
            }

            pageNum++;
        }

        return allPermits;
    }

    /**
     * Cleanup browser resources
     */
    protected async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

