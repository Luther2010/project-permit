/**
 * Gilroy Extractor implementation
 * Uses Puppeteer to interact with Energov/Tyler Technologies portal
 * Same system as Sunnyvale
 */

import { EnergovBaseExtractor } from "./energov-base-extractor";
import { ScrapeResult } from "../types";
import puppeteer from "puppeteer";

export class GilroyExtractor extends EnergovBaseExtractor {
    private readonly baseUrl = "https://gilroyca-energovweb.tylerhost.net";

    protected getBaseUrl(): string {
        return this.baseUrl;
    }

}

