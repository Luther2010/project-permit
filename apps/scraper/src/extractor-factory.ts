/**
 * Factory to create the appropriate extractor based on city configuration
 */

import { BaseExtractor } from "./base-extractor";
import { CityConfig } from "./types";
import { SanFranciscoExtractor } from "./extractors/san-francisco";
import { OaklandExtractor } from "./extractors/oakland";

/**
 * Create an extractor instance based on the extractor name
 */
export function createExtractor(config: CityConfig): BaseExtractor {
  switch (config.extractor) {
    case "SanFranciscoExtractor":
      return new SanFranciscoExtractor(config.city, config.state, config.url);
    
    case "OaklandExtractor":
      return new OaklandExtractor(config.city, config.state, config.url);
    
    default:
      throw new Error(`Unknown extractor: ${config.extractor}`);
  }
}

/**
 * Get all available extractor names
 */
export function getAvailableExtractors(): string[] {
  return [
    "SanFranciscoExtractor",
    "OaklandExtractor",
    // Add more extractors here as they're implemented
  ];
}

