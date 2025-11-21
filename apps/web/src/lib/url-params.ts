import { City } from "@prisma/client";
import type { FilterState } from "@/app/components/permit-filters";

/**
 * Valid cities for URL param validation
 */
export const VALID_CITIES = Object.values(City) as readonly City[];

/**
 * Serialize cities array to URL parameter string
 */
export function citiesToUrlParam(cities: City[]): string {
    return cities.length > 0 ? cities.join(",") : "";
}

/**
 * Deserialize URL parameter string to cities array
 */
export function urlParamToCities(
    param: string | null,
    validCities: readonly City[]
): City[] {
    if (!param) return [];
    return param
        .split(",")
        .filter((c): c is City => validCities.includes(c as City));
}

/**
 * Convert FilterState cities to URL search params
 */
export function filtersToSearchParams(filters: FilterState): URLSearchParams {
    const params = new URLSearchParams();

    // Cities
    const citiesParam = citiesToUrlParam(filters.cities);
    if (citiesParam) {
        params.set("cities", citiesParam);
    }

    // TODO: Add other filters as needed
    // - propertyTypes
    // - permitTypes
    // - statuses
    // - hasContractor
    // - minValue, maxValue
    // - minAppliedDate, maxAppliedDate
    // - minLastUpdateDate, maxLastUpdateDate

    return params;
}

/**
 * Convert URL search params to FilterState (cities only for now)
 */
export function searchParamsToFilters(
    searchParams: URLSearchParams
): Partial<FilterState> {
    const citiesParam = searchParams.get("cities");
    const cities = urlParamToCities(citiesParam, VALID_CITIES);

    return {
        cities,
        // TODO: Add other filters as needed
    };
}

/**
 * Check if URL search params contain any filter values
 */
export function hasFiltersInUrl(searchParams: URLSearchParams): boolean {
    // Check for cities
    if (searchParams.get("cities")) {
        return true;
    }
    
    // TODO: Add checks for other filters as needed
    // - propertyTypes
    // - permitTypes
    // - statuses
    // - hasContractor
    // - minValue, maxValue
    // - minAppliedDate, maxAppliedDate
    // - minLastUpdateDate, maxLastUpdateDate
    
    return false;
}

