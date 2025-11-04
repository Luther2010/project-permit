/**
 * Milpitas Extractor implementation
 * Uses Puppeteer to interact with eTRAKiT platform
 * Searches by permit number prefix in batches (cannot search by date)
 * Clicks into detail pages to extract full permit information
 */

import { EtrakitIdBasedExtractor, EtrakitIdBasedConfig } from "./etrakit-id-based-extractor";

export class MilpitasExtractor extends EtrakitIdBasedExtractor {
    /**
     * Get configuration for Milpitas extractor
     */
    protected getConfig(): EtrakitIdBasedConfig {
        return {
            basePrefixes: [
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
            ],
            yearSuffixDigits: 2,
            maxResultsPerBatch: 10, // With 3-digit suffixes, each batch covers ~10 permits, continues as long as there are results
            suffixDigits: 3, // For B-AC25-000, B-AC25-001, etc.
            searchByValue: "Permit Number",
            searchOperatorValue: "BEGINS WITH",
            searchButtonSelector: "#cplMain_btnSearch",
            permitInfoTabIdPrefix: "ctl02",
            extractTitle: true, // "Short Description" -> title
            descriptionFieldSuffix: "lblPermitNotes", // "Notes" -> description
            siteInfoTabIdPrefix: "ctl03",
            hasContactsTab: true,
            paginationConfig: {
                maxPages: 20,
                nextPageSelector: "input.PagerButton.NextPage, input[id*=\"btnPageNext\"]",
                waitAfterPageClick: 3000,
            },
        };
    }
}

