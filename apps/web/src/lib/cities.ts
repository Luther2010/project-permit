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
    SUNNYVALE: "Sunnyvale",
    SAN_JOSE: "San Jose",
    CAMPBELL: "Campbell",
    MOUNTAIN_VIEW: "Mountain View",
    GILROY: "Gilroy",
    MILPITAS: "Milpitas",
    MORGAN_HILL: "Morgan Hill",
    LOS_ALTOS: "Los Altos",
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

/**
 * Convert City enum to URL-friendly format (e.g., LOS_GATOS -> los-gatos)
 */
export function cityToUrlParam(city: City): string {
    return city.toLowerCase().replace(/_/g, "-");
}

/**
 * Get city page URL for a city
 */
export function getCityPageUrl(city: City): string {
    return `/cities/${cityToUrlParam(city)}`;
}

