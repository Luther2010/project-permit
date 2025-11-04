/**
 * Los Altos Hills Extractor implementation
 * Uses Puppeteer to interact with eTRAKiT platform
 * Extracts data directly from search results table (no detail pages)
 */

import { EtrakitIdBasedExtractor, EtrakitIdBasedConfig } from "./etrakit-id-based-extractor";
import { PermitData } from "../types";

export class LosAltosHillsExtractor extends EtrakitIdBasedExtractor {
    /**
     * Get configuration for Los Altos Hills extractor
     */
    protected getConfig(): EtrakitIdBasedConfig {
        return {
            basePrefixes: ["", "BLD", "EP", "GRD", "MISC", "OA", "PKG"], // Empty prefix for permits like "25-0001", plus other prefixes
            yearSuffixDigits: 2,
            maxResultsPerBatch: 10, // With 3-digit suffixes, each batch covers ~10 permits, continues as long as there are results
            suffixDigits: 3, // For 25-000, 25-001, etc. (searches "25-000" matches "25-0001", "25-0002", etc.)
            searchByValue: "Permit #", // Value is "Permit_Main.PERMIT_NO"
            searchOperatorValue: "BEGINS WITH",
            searchButtonSelector: "#ctl00_cplMain_btnSearch",
            // These are not used since Los Altos Hills has no detail pages, but required by interface
            permitInfoTabIdPrefix: "ctl02",
            extractTitle: false,
            descriptionFieldSuffix: undefined,
            siteInfoTabIdPrefix: "ctl03",
            hasContactsTab: false,
            // Table-only extraction configuration
            extractFromTableOnly: true,
            tableColumnMapping: {
                permitNumber: 0,      // Column 0: Permit # (BLD25-0001)
                appliedDate: 1,       // Column 1: APPLIED (01/03/2025)
                issuedDate: 3,        // Column 3: ISSUED (02/10/2025)
                address: 9,           // Column 9: Address (12695 LA CRESTA DRIVE)
                description: 10,      // Column 10: DESCRIPTION (INSTALL (N) 100 AMP SUBPANEL &...)
                value: 11,            // Column 11: JOBVALUE (4000)
                contractor: 13,       // Column 13: Contractor (APOLLO TB ELECTRIC)
                // Note: status is not in the table, we'll infer it from ISSUED column
            },
            paginationConfig: {
                maxPages: 27, // User mentioned "page 1 of 27" in pagination
                nextPageSelector: "input.PagerButton.NextPage, input[id*=\"btnPageNext\"]",
                waitAfterPageClick: 3000,
            },
        };
    }

    /**
     * Override extractPermitsFromTable to add status inference from ISSUED column
     * Los Altos Hills doesn't have a status column, so we infer: if ISSUED exists, status is "ISSUED", otherwise "IN_REVIEW"
     */
    protected async extractPermitsFromTable(): Promise<PermitData[]> {
        const permits = await super.extractPermitsFromTable();
        const config = this.getConfig();
        const mapping = config.tableColumnMapping;
        
        if (!mapping || mapping.issuedDate === undefined) {
            return permits;
        }
        
        // Re-extract issued date from table to determine status
        const rowElements = await this.page!.$$('tr.rgRow, tr.rgAltRow');
        
        for (let i = 0; i < permits.length && i < rowElements.length; i++) {
            const permit = permits[i];
            const rowElement = rowElements[i];
            
            // Skip if status is already set
            if (permit.status) {
                continue;
            }
            
            // Extract issued date from the table
            const cells = await rowElement.$$('td');
            if (cells.length > mapping.issuedDate) {
                const issuedDateCell = cells[mapping.issuedDate];
                const span = await issuedDateCell.$('span');
                let issuedDateStr = '';
                if (span) {
                    issuedDateStr = await this.page!.evaluate((el: any) => el.textContent?.trim() || '', span);
                } else {
                    issuedDateStr = await this.page!.evaluate((el: any) => el.textContent?.trim() || '', issuedDateCell);
                }
                
                // If ISSUED date exists and is not empty, status is "ISSUED", otherwise "IN_REVIEW"
                permit.status = issuedDateStr && issuedDateStr.trim() !== '' && issuedDateStr.trim() !== '&nbsp;' 
                    ? "ISSUED" 
                    : "IN_REVIEW";
            } else {
                // No issued date column found, default to IN_REVIEW
                permit.status = "IN_REVIEW";
            }
        }
        
        return permits;
    }
}
