/**
 * City update cadence configuration
 * Maps cities to their scraper type (update frequency)
 */
import { City } from "@prisma/client";

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
 * City to scraper type mapping
 * This should match the scraper configuration
 */
const CITY_CADENCE_MAP: Record<City, ScraperType> = {
    LOS_GATOS: "DAILY",
    SARATOGA: "ID_BASED",
    SANTA_CLARA: "DAILY",
    CUPERTINO: "DAILY",
    PALO_ALTO: "DAILY",
    LOS_ALTOS_HILLS: "ID_BASED",
    SUNNYVALE: "DAILY",
    SAN_JOSE: "DAILY",
    CAMPBELL: "DAILY",
    MOUNTAIN_VIEW: "DAILY",
    GILROY: "DAILY",
    MILPITAS: "DAILY",
    MORGAN_HILL: "MONTHLY",
    LOS_ALTOS: "ID_BASED",
};

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

