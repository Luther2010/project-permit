/**
 * City update cadence configuration
 * Derived from the scraper configuration to avoid duplication
 */
import { City } from "@prisma/client";
import { citiesConfig } from "../../../scraper/src/config/cities";

export type ScraperType = "DAILY" | "MONTHLY" | "ID_BASED";

export interface CityCadence {
    city: City;
    cadence: ScraperType;
    description: string;
}

/**
 * Map scraper type to human-readable description
 */
function getCadenceDescription(cadence: ScraperType): string {
    switch (cadence) {
        case "DAILY":
            return "Updated daily";
        case "MONTHLY":
            return "Updated monthly";
        case "ID_BASED":
            return "Updated daily";
        default:
            return "Unknown";
    }
}

/**
 * Build city cadence map from scraper config
 * This ensures we always use the source of truth from the scraper
 */
function buildCityCadenceMap(): Record<City, ScraperType> {
    const map: Partial<Record<City, ScraperType>> = {};
    
    for (const cityConfig of citiesConfig) {
        if (!cityConfig.enabled) continue;
        
        map[cityConfig.cityEnum] = cityConfig.scraperType as ScraperType;
    }
    
    return map as Record<City, ScraperType>;
}

const CITY_CADENCE_MAP = buildCityCadenceMap();

/**
 * Get cadence information for all cities
 */
export function getAllCityCadences(): CityCadence[] {
    return Object.entries(CITY_CADENCE_MAP).map(([city, cadence]) => ({
        city: city as City,
        cadence,
        description: getCadenceDescription(cadence),
    }));
}

/**
 * Get cadence for a specific city
 */
export function getCityCadence(city: City): CityCadence {
    return {
        city,
        cadence: CITY_CADENCE_MAP[city],
        description: getCadenceDescription(CITY_CADENCE_MAP[city]),
    };
}

