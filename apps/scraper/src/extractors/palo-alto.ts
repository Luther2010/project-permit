/**
 * Palo Alto Extractor implementation
 * Uses Puppeteer to interact with the Accela Civic Platform
 * Similar to other Accela-based cities (Los Gatos, Santa Clara, Cupertino)
 */

import { AccelaBaseExtractor } from "./accela-base-extractor";

export class PaloAltoExtractor extends AccelaBaseExtractor {
    protected getLoggerPrefix(): string {
        return "[PaloAltoExtractor]";
    }

    protected getDefaultCity(): string {
        return "Palo Alto";
    }

    protected getScreenshotPrefix(): string {
        return "palo-alto";
    }
}

