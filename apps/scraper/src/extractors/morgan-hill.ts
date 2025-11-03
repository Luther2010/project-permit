import { EtrakitIdBasedExtractor } from "./etrakit-id-based-extractor";
import { PermitData, ScrapeResult } from "../types";
import { normalizeEtrakitStatus } from "../utils/etrakit-status";

export class MorganHillExtractor extends EtrakitIdBasedExtractor {
    getName(): string {
        return "MorganHillExtractor";
    }

    protected readonly PERMIT_PREFIXES = [
        "BCOM2025",
        "BRES2025",
        "ELEC2025",
        "ENC2025",
        "FIRE2025",
        "GRD2025",
        "IR2025",
        "MECH2025",
        "MST2025",
        "OCC2025",
        "OSOW2025",
        "PLMG2025",
        "SOLR2025",
        "SPEC2025",
    ];

    protected readonly MAX_RESULTS_PER_BATCH = 100; // 20 pages × 5 results per page

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

            // Search for each prefix
            for (const prefix of this.PERMIT_PREFIXES) {
                console.log(`[MorganHillExtractor] Searching for prefix: ${prefix}`);

                // Search in batches: prefix-00, prefix-01, prefix-02, etc.
                let batchNumber = 0;
                let hasMoreBatches = true;

                while (hasMoreBatches) {
                    // Format batch search string: prefix-00, prefix-01, etc.
                    const batchSuffix = String(batchNumber).padStart(2, "0");
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

                    // If we got exactly MAX_RESULTS_PER_BATCH results, there might be more
                    // Continue to next batch (prefix-01, prefix-02, etc.)
                    if (resultCount >= this.MAX_RESULTS_PER_BATCH) {
                        batchNumber++;
                        console.log(`[MorganHillExtractor] Got ${resultCount} results (max), checking next batch...`);
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
        data.description = await getSpanText('cplMain_ctl02_lblWorkDesc');
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

    /**
     * Override extractPermitDetail to skip Contacts tab (Morgan Hill doesn't have it)
     */
    protected async extractPermitDetail(permitNumber: string): Promise<PermitData | null> {
        // Click on the permit row to navigate to detail page
        const clicked = await this.clickPermitRow(permitNumber);
        if (!clicked) {
            console.warn(`[${this.getName()}] Could not find permit row for ${permitNumber}`);
            return null;
        }

        // Verify we're on the detail page by checking for expected elements
        try {
            await this.page!.waitForSelector('#cplMain_ctl02_lblPermitType, #cplMain_ctl02_lblPermitStatus', { timeout: 5000 });
        } catch (e) {
            console.warn(`[${this.getName()}] Detail page may not have loaded for ${permitNumber}`);
        }

        // Start with basic permit data
        const permitData: Partial<PermitData> = {
            permitNumber,
            city: this.city,
            state: this.state,
            sourceUrl: this.url,
        };

        try {
            // Extract from Permit Info tab (default tab)
            const permitInfo = await this.extractPermitInfoTab();
            Object.assign(permitData, permitInfo);

            // Skip Contacts tab - Morgan Hill doesn't have it

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
     * Override extractSiteInfoTab to use Morgan Hill-specific element IDs
     * (Should be similar to Milpitas structure)
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
        // Format: "MORGAN HILL, CA, 95037"
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
}

