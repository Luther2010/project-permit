import { EtrakitIdBasedExtractor, EtrakitIdBasedConfig } from "./etrakit-id-based-extractor";

export class LosAltosExtractor extends EtrakitIdBasedExtractor {
    /**
     * Get configuration for Los Altos extractor
     */
    protected getConfig(): EtrakitIdBasedConfig {
        return {
            basePrefixes: [
                "ADR",
                "BLD",
                "E",
                "LC",
                "ONBLD",
                "PAADU",
                "PRADU",
                "PS",
                "SE",
                "SOLAR",
                "SWO",
                "TP",
                "X",
            ],
            yearSuffixDigits: 2,
            maxResultsPerBatch: 10, // 5 pages × 10 results per page = 50 max, but we use 4-digit suffixes to get 10 per batch
            suffixDigits: 4,
            searchByValue: "Permit #", // Note: Los Altos uses "Permit #" with space
            searchOperatorValue: "BEGINS WITH",
            searchButtonSelector: "#ctl00_cplMain_btnSearch, #cplMain_btnSearch",
            permitInfoTabIdPrefix: "ctl07",
            extractTitle: true, // "Short Description" -> title
            descriptionFieldSuffix: undefined, // Uses lblPermitDesc for description
            siteInfoTabIdPrefix: "ctl08",
            hasContactsTab: false, // Los Altos doesn't have Contacts tab
            paginationConfig: {
                maxPages: 50,
                nextPageSelector: "input.PagerButton.NextPage, input[id*=\"btnPageNext\"]",
                waitAfterPageClick: 3000,
            },
        };
    }
}
