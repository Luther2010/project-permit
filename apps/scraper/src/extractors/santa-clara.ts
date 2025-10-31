/**
 * Santa Clara Extractor implementation
 * Uses Puppeteer to interact with the Accela Civic Platform
 * Similar to Los Gatos but for Santa Clara city
 */

import { AccelaBaseExtractor } from "./accela-base-extractor";

export class SantaClaraExtractor extends AccelaBaseExtractor {
    protected getLoggerPrefix(): string {
        return "[SantaClaraExtractor]";
    }

    protected getDefaultCity(): string {
        return "Santa Clara";
    }

    protected getScreenshotPrefix(): string {
        return "santa-clara";
    }
}
