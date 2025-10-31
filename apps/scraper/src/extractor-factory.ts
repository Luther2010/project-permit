/**
 * Factory to create the appropriate extractor based on city configuration
 */

import { BaseExtractor } from "./base-extractor";
import { CityConfig } from "./types";
import { LosGatosExtractor } from "./extractors/los-gatos";
import { SaratogaExtractor } from "./extractors/saratoga";
import { SantaClaraExtractor } from "./extractors/santa-clara";

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
        // Add more extractors here as they're implemented
    ];
}
