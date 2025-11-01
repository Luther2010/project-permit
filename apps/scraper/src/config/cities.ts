/**
 * City to extractor mapping configuration
 * Add new cities here with their corresponding extractor
 */

import { CityConfig } from "../types";

export const citiesConfig: CityConfig[] = [
    {
        city: "Los Gatos",
        state: "CA",
        extractor: "LosGatosExtractor",
        url: "https://aca-prod.accela.com/TLG/Cap/CapHome.aspx?module=Building&TabName=HOME",
        enabled: true,
    },
    {
        city: "Saratoga",
        state: "CA",
        extractor: "SaratogaExtractor",
        url: "https://sara.csqrcloud.com/community-etrakit/Search/permit.aspx",
        enabled: true,
    },
    {
        city: "Santa Clara",
        state: "CA",
        extractor: "SantaClaraExtractor",
        url: "https://aca-prod.accela.com/SANTACLARA/Cap/CapHome.aspx?module=Building&TabName=Building",
        enabled: true,
    },
    {
        city: "Cupertino",
        state: "CA",
        extractor: "CupertinoExtractor",
        url: "https://aca-prod.accela.com/CUPERTINO/Cap/CapHome.aspx?module=Building&TabName=Home",
        enabled: true,
    },
    {
        city: "Palo Alto",
        state: "CA",
        extractor: "PaloAltoExtractor",
        url: "https://aca-prod.accela.com/PALOALTO/Cap/CapHome.aspx?module=Building&TabName=Building",
        enabled: true,
    },
    {
        city: "Los Altos Hills",
        state: "CA",
        extractor: "LosAltosHillsExtractor",
        url: "https://trakit.losaltoshills.ca.gov/etrakit/Search/permit.aspx",
        enabled: true,
    },
    {
        city: "Sunnyvale",
        state: "CA",
        extractor: "SunnyvaleExtractor",
        url: "https://sunnyvaleca-energovpub.tylerhost.net/apps/SelfService#/search",
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
