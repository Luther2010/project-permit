/**
 * Los Gatos Extractor implementation
 * Uses Puppeteer to interact with the Accela Civic Platform
 * Since the site doesn't support URL-based search, we need to fill in the date field in the UI
 */

import { AccelaBaseExtractor } from "./accela-base-extractor";

export class LosGatosExtractor extends AccelaBaseExtractor {
    protected getLoggerPrefix(): string {
        return "[LosGatosExtractor]";
    }

    protected getDefaultCity(): string {
        return "Los Gatos";
    }

    protected getScreenshotPrefix(): string {
        return "los-gatos";
    }
}
