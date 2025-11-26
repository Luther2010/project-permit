/**
 * City to extractor mapping configuration
 * Add new cities here with their corresponding extractor
 */

import { CityConfig, ScraperType } from "../types";
import { City } from "@prisma/client";

export const citiesConfig: CityConfig[] = [
    {
        city: "Los Gatos",
        cityEnum: City.LOS_GATOS,
        state: "CA",
        extractor: "LosGatosExtractor",
        url: "https://aca-prod.accela.com/TLG/Cap/CapHome.aspx?module=Building&TabName=HOME",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "Saratoga",
        cityEnum: City.SARATOGA,
        state: "CA",
        extractor: "SaratogaExtractor",
        url: "https://sara.csqrcloud.com/community-etrakit/Search/permit.aspx",
        enabled: true,
        scraperType: ScraperType.ID_BASED,
    },
    {
        city: "Santa Clara",
        cityEnum: City.SANTA_CLARA,
        state: "CA",
        extractor: "SantaClaraExtractor",
        url: "https://aca-prod.accela.com/SANTACLARA/Cap/CapHome.aspx?module=Building&TabName=Building",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "Cupertino",
        cityEnum: City.CUPERTINO,
        state: "CA",
        extractor: "CupertinoExtractor",
        url: "https://aca-prod.accela.com/CUPERTINO/Cap/CapHome.aspx?module=Building&TabName=Home",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "Palo Alto",
        cityEnum: City.PALO_ALTO,
        state: "CA",
        extractor: "PaloAltoExtractor",
        url: "https://aca-prod.accela.com/PALOALTO/Cap/CapHome.aspx?module=Building&TabName=Building",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "Los Altos Hills",
        cityEnum: City.LOS_ALTOS_HILLS,
        state: "CA",
        extractor: "LosAltosHillsExtractor",
        url: "https://trakit.losaltoshills.ca.gov/etrakit/Search/permit.aspx",
        enabled: true,
        scraperType: ScraperType.ID_BASED,
    },
    {
        city: "Sunnyvale",
        cityEnum: City.SUNNYVALE,
        state: "CA",
        extractor: "SunnyvaleExtractor",
        url: "https://sunnyvaleca-energovpub.tylerhost.net/apps/SelfService#/search",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "San Jose",
        cityEnum: City.SAN_JOSE,
        state: "CA",
        extractor: "SanJoseExtractor",
        url: "https://data.sanjoseca.gov/api/3/action/datastore_search",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "Campbell",
        cityEnum: City.CAMPBELL,
        state: "CA",
        extractor: "CampbellExtractor",
        url: "https://www.mgoconnect.org/cp/search",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "Mountain View",
        cityEnum: City.MOUNTAIN_VIEW,
        state: "CA",
        extractor: "MountainViewExtractor",
        url: "https://www.mountainview.gov/our-city/departments/community-development/building-fire-inspection/building-general-information/permit-history/-folder-637",
        enabled: true,
        scraperType: ScraperType.MONTHLY,
    },
    {
        city: "Gilroy",
        cityEnum: City.GILROY,
        state: "CA",
        extractor: "GilroyExtractor",
        url: "https://gilroyca-energovweb.tylerhost.net/apps/SelfService#/search",
        enabled: true,
        scraperType: ScraperType.DAILY,
    },
    {
        city: "Milpitas",
        cityEnum: City.MILPITAS,
        state: "CA",
        extractor: "MilpitasExtractor",
        url: "https://trakit.ci.milpitas.ca.gov/ETRAKIT3/Search/permit.aspx",
        enabled: true,
        scraperType: ScraperType.ID_BASED,
    },
    {
        city: "Morgan Hill",
        cityEnum: City.MORGAN_HILL,
        state: "CA",
        extractor: "MorganHillExtractor",
        url: "https://morg-trk.aspgov.com/etrakit/Search/permit.aspx",
        enabled: true,
        scraperType: ScraperType.ID_BASED,
    },
    {
        city: "Los Altos",
        cityEnum: City.LOS_ALTOS,
        state: "CA",
        extractor: "LosAltosExtractor",
        url: "https://trakit.losaltosca.gov/etrakit/Search/Permit.aspx",
        enabled: true,
        scraperType: ScraperType.ID_BASED,
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
