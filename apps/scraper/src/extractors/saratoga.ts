/**
 * Saratoga Extractor implementation
 * Uses Puppeteer to interact with eTRAKiT platform
 * Extracts data directly from search results table (no detail pages)
 */

import { EtrakitIdBasedExtractor, EtrakitIdBasedConfig } from "./etrakit-id-based-extractor";

export class SaratogaExtractor extends EtrakitIdBasedExtractor {
    /**
     * Get configuration for Saratoga extractor
     */
    protected getConfig(): EtrakitIdBasedConfig {
        return {
            basePrefixes: [""], // Empty prefix - permit numbers are "25-0001", "25-0002", etc.
            yearSuffixDigits: 2,
            maxResultsPerBatch: 10, // With 3-digit suffixes, each batch covers ~10 permits, continues as long as there are results
            suffixDigits: 3, // For 25-000, 25-001, etc. (searches "25-000" matches "25-0001", "25-0002", etc.)
            searchByValue: "PERMIT #", // Value is "Permit_Main.PERMIT_NO"
            searchOperatorValue: "BEGINS WITH",
            searchButtonSelector: "#ctl00_cplMain_btnSearch",
            // These are not used since Saratoga has no detail pages, but required by interface
            permitInfoTabIdPrefix: "ctl02",
            extractTitle: false,
            descriptionFieldSuffix: undefined,
            siteInfoTabIdPrefix: "ctl03",
            hasContactsTab: false,
            // Table-only extraction configuration
            extractFromTableOnly: true,
            tableColumnMapping: {
                permitNumber: 0,      // Column 0: Permit Number (25-0001)
                appliedDate: 1,       // Column 1: Applied Date (01/02/2025)
                issuedDate: 2,        // Column 2: Issued Date (01/24/2025)
                status: 5,            // Column 5: Status (FINALED, ISSUED)
                address: 7,            // Column 7: Address (19112 OAHU LN)
                description: 8,       // Column 8: Description (PV SOLAR AND ESS)
                value: 9,             // Column 9: Value (0, 23950, 634368)
                contractor: 10,       // Column 10: Contractor (CINNAMON SOLAR)
            },
            paginationConfig: {
                maxPages: 20,
                nextPageSelector: "input.PagerButton.NextPage, input[id*=\"btnPageNext\"]",
                waitAfterPageClick: 3000,
            },
        };
    }
}
