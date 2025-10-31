/**
 * Factory to create the appropriate extractor based on city configuration
 */

import { BaseExtractor } from "./base-extractor";
import { CityConfig } from "./types";
import { LosGatosExtractor } from "./extractors/los-gatos";
import { SaratogaExtractor } from "./extractors/saratoga";
import { SantaClaraExtractor } from "./extractors/santa-clara";
import { CupertinoExtractor } from "./extractors/cupertino";
import { PaloAltoExtractor } from "./extractors/palo-alto";
import { LosAltosHillsExtractor } from "./extractors/los-altos-hills";

/**
 * Create an extractor instance based on the extractor name
 */
export function createExtractor(config: CityConfig): BaseExtractor {
    switch (config.extractor) {
        case "LosGatosExtractor":
            return new LosGatosExtractor(config.city, config.state, config.url);
        case "SaratogaExtractor":
            return new SaratogaExtractor(config.city, config.state, config.url);
        case "SantaClaraExtractor":
            return new SantaClaraExtractor(config.city, config.state, config.url);
        case "CupertinoExtractor":
            return new CupertinoExtractor(config.city, config.state, config.url);
        case "PaloAltoExtractor":
            return new PaloAltoExtractor(config.city, config.state, config.url);
        case "LosAltosHillsExtractor":
            return new LosAltosHillsExtractor(config.city, config.state, config.url);

        default:
            throw new Error(`Unknown extractor: ${config.extractor}`);
    }
}

/**
 * Get all available extractor names
 */
export function getAvailableExtractors(): string[] {
    return [
        "LosGatosExtractor",
        "SaratogaExtractor",
        "SantaClaraExtractor",
        "CupertinoExtractor",
        "PaloAltoExtractor",
        "LosAltosHillsExtractor",
        // Add more extractors here as they're implemented
    ];
}
