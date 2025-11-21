import { City, PermitStatus, PropertyType, PermitType } from "@prisma/client";
import type { FilterState } from "@/app/components/permit-filters";

/**
 * Valid cities for URL param validation
 */
export const VALID_CITIES = Object.values(City) as readonly City[];

/**
 * Valid statuses for URL param validation
 */
export const VALID_STATUSES = Object.values(PermitStatus) as readonly PermitStatus[];

/**
 * Valid property types for URL param validation
 */
export const VALID_PROPERTY_TYPES = Object.values(PropertyType) as readonly PropertyType[];

/**
 * Valid permit types for URL param validation
 */
export const VALID_PERMIT_TYPES = Object.values(PermitType) as readonly PermitType[];

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
 * Serialize statuses array to URL parameter string
 */
export function statusesToUrlParam(statuses: PermitStatus[]): string {
    return statuses.length > 0 ? statuses.join(",") : "";
}

/**
 * Deserialize URL parameter string to statuses array
 */
export function urlParamToStatuses(
    param: string | null,
    validStatuses: readonly PermitStatus[]
): PermitStatus[] {
    if (!param) return [];
    return param
        .split(",")
        .filter((s): s is PermitStatus => validStatuses.includes(s as PermitStatus));
}

/**
 * Serialize property types array to URL parameter string
 */
export function propertyTypesToUrlParam(propertyTypes: PropertyType[]): string {
    return propertyTypes.length > 0 ? propertyTypes.join(",") : "";
}

/**
 * Deserialize URL parameter string to property types array
 */
export function urlParamToPropertyTypes(
    param: string | null,
    validPropertyTypes: readonly PropertyType[]
): PropertyType[] {
    if (!param) return [];
    return param
        .split(",")
        .filter((p): p is PropertyType => validPropertyTypes.includes(p as PropertyType));
}

/**
 * Serialize permit types array to URL parameter string
 */
export function permitTypesToUrlParam(permitTypes: PermitType[]): string {
    return permitTypes.length > 0 ? permitTypes.join(",") : "";
}

/**
 * Deserialize URL parameter string to permit types array
 */
export function urlParamToPermitTypes(
    param: string | null,
    validPermitTypes: readonly PermitType[]
): PermitType[] {
    if (!param) return [];
    return param
        .split(",")
        .filter((p): p is PermitType => validPermitTypes.includes(p as PermitType));
}

/**
 * Convert FilterState to URL search params
 */
export function filtersToSearchParams(filters: FilterState): URLSearchParams {
    const params = new URLSearchParams();

    // Cities
    const citiesParam = citiesToUrlParam(filters.cities);
    if (citiesParam) {
        params.set("cities", citiesParam);
    }

    // Statuses
    const statusesParam = statusesToUrlParam(filters.statuses);
    if (statusesParam) {
        params.set("statuses", statusesParam);
    }

    // Property Types
    const propertyTypesParam = propertyTypesToUrlParam(filters.propertyTypes);
    if (propertyTypesParam) {
        params.set("propertyTypes", propertyTypesParam);
    }

    // Permit Types
    const permitTypesParam = permitTypesToUrlParam(filters.permitTypes);
    if (permitTypesParam) {
        params.set("permitTypes", permitTypesParam);
    }

    // Last Update Date Range
    if (filters.minLastUpdateDate) {
        params.set("minLastUpdateDate", filters.minLastUpdateDate);
    }
    if (filters.maxLastUpdateDate) {
        params.set("maxLastUpdateDate", filters.maxLastUpdateDate);
    }

    // Value Range
    if (filters.minValue) {
        params.set("minValue", filters.minValue);
    }
    if (filters.maxValue) {
        params.set("maxValue", filters.maxValue);
    }

    // Has Contractor
    if (filters.hasContractor !== null) {
        params.set("hasContractor", filters.hasContractor ? "true" : "false");
    }

    // Applied Date Range
    if (filters.minAppliedDate) {
        params.set("minAppliedDate", filters.minAppliedDate);
    }
    if (filters.maxAppliedDate) {
        params.set("maxAppliedDate", filters.maxAppliedDate);
    }

    return params;
}

/**
 * Convert URL search params to FilterState
 */
export function searchParamsToFilters(
    searchParams: URLSearchParams
): Partial<FilterState> {
    const citiesParam = searchParams.get("cities");
    const cities = urlParamToCities(citiesParam, VALID_CITIES);

    const statusesParam = searchParams.get("statuses");
    const statuses = urlParamToStatuses(statusesParam, VALID_STATUSES);

    const propertyTypesParam = searchParams.get("propertyTypes");
    const propertyTypes = urlParamToPropertyTypes(propertyTypesParam, VALID_PROPERTY_TYPES);

    const permitTypesParam = searchParams.get("permitTypes");
    const permitTypes = urlParamToPermitTypes(permitTypesParam, VALID_PERMIT_TYPES);

    // Last Update Date Range
    const minLastUpdateDate = searchParams.get("minLastUpdateDate") || "";
    const maxLastUpdateDate = searchParams.get("maxLastUpdateDate") || "";

    // Value Range
    const minValue = searchParams.get("minValue") || "";
    const maxValue = searchParams.get("maxValue") || "";

    // Has Contractor
    const hasContractorParam = searchParams.get("hasContractor");
    const hasContractor = hasContractorParam === "true" ? true : hasContractorParam === "false" ? false : null;

    // Applied Date Range
    const minAppliedDate = searchParams.get("minAppliedDate") || "";
    const maxAppliedDate = searchParams.get("maxAppliedDate") || "";

    return {
        cities,
        statuses,
        propertyTypes,
        permitTypes,
        minLastUpdateDate,
        maxLastUpdateDate,
        minAppliedDate,
        maxAppliedDate,
        minValue,
        maxValue,
        hasContractor,
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
    
    // Check for statuses
    if (searchParams.get("statuses")) {
        return true;
    }

    // Check for property types
    if (searchParams.get("propertyTypes")) {
        return true;
    }

    // Check for permit types
    if (searchParams.get("permitTypes")) {
        return true;
    }

    // Check for last update date range
    if (searchParams.get("minLastUpdateDate") || searchParams.get("maxLastUpdateDate")) {
        return true;
    }

    // Check for value range
    if (searchParams.get("minValue") || searchParams.get("maxValue")) {
        return true;
    }

    // Check for has contractor
    if (searchParams.get("hasContractor")) {
        return true;
    }

    // Check for applied date range
    if (searchParams.get("minAppliedDate") || searchParams.get("maxAppliedDate")) {
        return true;
    }
    
    return false;
}

