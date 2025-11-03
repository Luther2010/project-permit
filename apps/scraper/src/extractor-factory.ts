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
import { SunnyvaleExtractor } from "./extractors/sunnyvale";
import { SanJoseExtractor } from "./extractors/san-jose";
import { CampbellExtractor } from "./extractors/campbell";
import { MountainViewExtractor } from "./extractors/mountain-view";
import { GilroyExtractor } from "./extractors/gilroy";
import { MilpitasExtractor } from "./extractors/milpitas";

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
        case "SunnyvaleExtractor":
            return new SunnyvaleExtractor(config.city, config.state, config.url);
        case "SanJoseExtractor":
            return new SanJoseExtractor(config.city, config.state, config.url);
        case "CampbellExtractor":
            return new CampbellExtractor(config.city, config.state, config.url);
        case "MountainViewExtractor":
            return new MountainViewExtractor(config.city, config.state, config.url);
        case "GilroyExtractor":
            return new GilroyExtractor(config.city, config.state, config.url);
        case "MilpitasExtractor":
            return new MilpitasExtractor(config.city, config.state, config.url);

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
        "SunnyvaleExtractor",
        "SanJoseExtractor",
        "CampbellExtractor",
        "MountainViewExtractor",
        "GilroyExtractor",
        "MilpitasExtractor",
        // Add more extractors here as they're implemented
    ];
}
