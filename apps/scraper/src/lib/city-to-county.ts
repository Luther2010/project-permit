/**
 * City to County Mapping
 * 
 * Maps cities in our permit database to their counties.
 * Used as a fallback when contractor county is not available in DB.
 * 
 * Focus on Bay Area counties relevant to Santa Clara County:
 * - Santa Clara County
 * - San Mateo County
 * - Alameda County
 * - Santa Cruz County
 * - San Benito County
 * - Monterey County (partial)
 */

// Note: County enum is defined in apps/web/prisma/schema.prisma
// We'll use string literals here and convert at runtime
// This avoids dependency on generated Prisma client in scraper

// County enum values (matching Prisma schema)
export type County = 
  | 'SANTA_CLARA'
  | 'SAN_MATEO'
  | 'ALAMEDA'
  | 'SANTA_CRUZ'
  | 'SAN_BENITO'
  | 'MONTEREY'
  | 'CONTRA_COSTA';

// City enum values from Prisma -> County enum
export const CITY_TO_COUNTY: Record<string, County> = {
  // Santa Clara County
  'LOS_GATOS': 'SANTA_CLARA',
  'SARATOGA': 'SANTA_CLARA',
  'SANTA_CLARA': 'SANTA_CLARA',
  'CUPERTINO': 'SANTA_CLARA',
  'PALO_ALTO': 'SANTA_CLARA',
  'LOS_ALTOS_HILLS': 'SANTA_CLARA',
  'SUNNYVALE': 'SANTA_CLARA',
  'SAN_JOSE': 'SANTA_CLARA',
  'CAMPBELL': 'SANTA_CLARA',
  'MOUNTAIN_VIEW': 'SANTA_CLARA',
  'MILPITAS': 'SANTA_CLARA',
  'MORGAN_HILL': 'SANTA_CLARA',
  'LOS_ALTOS': 'SANTA_CLARA',
  'GILROY': 'SANTA_CLARA',
  
  // Add more cities as needed
  // San Mateo County examples: 'REDWOOD_CITY': 'SAN_MATEO', etc.
  // Alameda County examples: 'FREMONT': 'ALAMEDA', etc.
};

/**
 * Bay Area counties that are relevant for contractor matching
 * These are neighboring counties to Santa Clara County
 */
export const BAY_AREA_COUNTIES: County[] = [
  'SANTA_CLARA',
  'SAN_MATEO',
  'ALAMEDA',
  'SANTA_CRUZ',
  'SAN_BENITO',
  'MONTEREY', // Partial, but some contractors work in both
  'CONTRA_COSTA',
];

/**
 * Get county for a city
 * Returns undefined if city is not in our mapping
 */
export function getCountyForCity(city: string): County | undefined {
  return CITY_TO_COUNTY[city.toUpperCase()];
}

/**
 * Check if a county is in the Bay Area (relevant for matching)
 */
export function isBayAreaCounty(county: County | string): boolean {
  return BAY_AREA_COUNTIES.includes(county as County);
}

