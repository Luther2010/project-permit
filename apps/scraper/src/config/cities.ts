/**
 * City to extractor mapping configuration
 * Add new cities here with their corresponding extractor
 */

import { CityConfig } from "../types";

export const citiesConfig: CityConfig[] = [
  {
    city: "San Francisco",
    state: "CA",
    extractor: "SanFranciscoExtractor",
    url: "https://sfplanning.org/permit-search",
    enabled: true,
  },
  {
    city: "Oakland",
    state: "CA",
    extractor: "OaklandExtractor",
    url: "https://aca-prod.accela.com/OAKL/Cap/CapHome.aspx",
    enabled: true,
  },
  // Add more cities and their extractors here
  // Example:
  // {
  //   city: "Berkeley",
  //   state: "CA",
  //   extractor: "BerkeleyExtractor",
  //   url: "https://berkeley.example.com/permits",
  //   enabled: false, // Enable when extractor is implemented
  // },
];

/**
 * Get enabled cities configuration
 */
export function getEnabledCities(): CityConfig[] {
  return citiesConfig.filter((city) => city.enabled);
}

/**
 * Get city config by name
 */
export function getCityConfig(cityName: string): CityConfig | undefined {
  return citiesConfig.find((city) => city.city === cityName);
}

