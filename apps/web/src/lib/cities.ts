/**
 * City configuration for the web app
 * This should match the cities in the scraper config
 */
import { City } from "@prisma/client";

/**
 * Map of city enum values to display names
 */
export const CITY_DISPLAY_NAMES: Record<City, string> = {
    LOS_GATOS: "Los Gatos",
    SARATOGA: "Saratoga",
    SANTA_CLARA: "Santa Clara",
    CUPERTINO: "Cupertino",
    PALO_ALTO: "Palo Alto",
    LOS_ALTOS_HILLS: "Los Altos Hills",
};

/**
 * Get all enabled cities (cities that have scrapers)
 */
export function getEnabledCities(): City[] {
    return Object.keys(CITY_DISPLAY_NAMES) as City[];
}

/**
 * Get display name for a city enum
 */
export function getCityDisplayName(city: City): string {
    return CITY_DISPLAY_NAMES[city] || city;
}

