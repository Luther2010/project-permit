/**
 * Sunnyvale Extractor implementation
 * Uses Puppeteer to interact with Energov/Tyler Technologies portal
 * Parses HTML results directly from search page (no CSV export available)
 */

import { EnergovBaseExtractor } from "./energov-base-extractor";
import { PermitData, ScrapeResult } from "../types";
import puppeteer, { Browser, Page } from "puppeteer";

export class SunnyvaleExtractor extends EnergovBaseExtractor {
    private readonly baseUrl = "https://sunnyvaleca-energovpub.tylerhost.net";

    protected getBaseUrl(): string {
        return this.baseUrl;
    }

}
