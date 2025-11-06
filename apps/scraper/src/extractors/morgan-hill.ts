import { EtrakitIdBasedExtractor, EtrakitIdBasedConfig } from "./etrakit-id-based-extractor";

export class MorganHillExtractor extends EtrakitIdBasedExtractor {
    /**
     * Get configuration for Morgan Hill extractor
     */
    protected getConfig(): EtrakitIdBasedConfig {
        return {
            basePrefixes: [
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
            ],
            yearSuffixDigits: 4,
            maxResultsPerBatch: 10, // 5 pages × 10 results per page = 50 max, but we use 3-digit suffixes to get 10 per batch
            suffixDigits: 3,
            searchByValue: "Permit#",
            searchOperatorValue: "BEGINS WITH",
            searchButtonSelector: "#ctl00_cplMain_btnSearch",
            permitInfoTabIdPrefix: "ctl07",
            extractTitle: false, // No title, only description
            descriptionFieldSuffix: undefined, // Uses lblPermitDesc for description
            siteInfoTabIdPrefix: "ctl08",
            hasContactsTab: true, // Morgan Hill has Contacts tab when logged in
            paginationConfig: {
                maxPages: 50,
                nextPageSelector: "input.PagerButton.NextPage, input[id*=\"btnPageNext\"]",
                waitAfterPageClick: 3000,
            },
            login: {
                loginType: "Public",
                username: "Luther2010",
                password: "B!Y33zg!HGAViE6",
            },
        };
    }
}
