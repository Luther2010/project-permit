/**
 * Cupertino Extractor implementation
 * Uses Puppeteer to interact with the Accela Civic Platform
 * Similar to Los Gatos and Santa Clara but for Cupertino city
 */

import { AccelaBaseExtractor } from "./accela-base-extractor";

export class CupertinoExtractor extends AccelaBaseExtractor {
    protected getLoggerPrefix(): string {
        return "[CupertinoExtractor]";
    }

    protected getDefaultCity(): string {
        return "Cupertino";
    }

    protected getScreenshotPrefix(): string {
        return "cupertino";
    }
}

