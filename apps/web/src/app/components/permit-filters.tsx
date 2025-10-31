"use client";

import { PropertyTypeFilter } from "./filters/property-type-filter";
import { PermitTypeFilter } from "./filters/permit-type-filter";
import { CityFilter } from "./filters/city-filter";
import { ValueRangeFilter } from "./filters/value-range-filter";
import { IssueDateRangeFilter } from "./filters/issue-date-range-filter";
import { HasContractorFilter } from "./filters/has-contractor-filter";
import type { PropertyType, PermitType, City } from "@prisma/client";
import { getCityDisplayName } from "@/lib/cities";

export interface FilterState {
    propertyTypes: PropertyType[];
    permitTypes: PermitType[];
    cities: City[];
    hasContractor: boolean | null;
    minValue: string;
    maxValue: string;
    minIssuedDate: string;
    maxIssuedDate: string;
}

interface PermitFiltersProps {
    filters: FilterState;
    onFiltersChange: (filters: FilterState) => void;
    onSearch: () => void;
}

export function PermitFilters({
    filters,
    onFiltersChange,
    onSearch,
}: PermitFiltersProps) {
    const handleChange = <K extends keyof FilterState>(field: K, value: FilterState[K]) => {
        onFiltersChange({
            ...filters,
            [field]: value,
        });
    };

    const handleReset = () => {
        const resetFilters: FilterState = {
            propertyTypes: [],
            permitTypes: [],
            cities: [],
            hasContractor: null,
            minValue: "",
            maxValue: "",
            minIssuedDate: "",
            maxIssuedDate: "",
        };
        onFiltersChange(resetFilters);
    };

    const hasActiveFilters =
        filters.propertyTypes.length > 0 ||
        filters.permitTypes.length > 0 ||
        filters.cities.length > 0 ||
        (filters.hasContractor !== null) ||
        filters.minValue ||
        filters.maxValue ||
        filters.minIssuedDate ||
        filters.maxIssuedDate;

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            {/* Filters Header */}
            <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Filter Permits</h2>
            </div>

            {/* Filters */}
            <div className="px-4 pb-4 pt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <PropertyTypeFilter
                        selectedTypes={filters.propertyTypes}
                        onChange={(types) => handleChange("propertyTypes", types)}
                    />

                    <PermitTypeFilter
                        selectedTypes={filters.permitTypes}
                        onChange={(types) => handleChange("permitTypes", types)}
                    />

                    <CityFilter
                        selectedCities={filters.cities}
                        onChange={(cities) => handleChange("cities", cities)}
                    />
                    <HasContractorFilter
                        value={filters.hasContractor}
                        onChange={(value) => handleChange("hasContractor", value)}
                    />

                    <ValueRangeFilter
                        minValue={filters.minValue}
                        maxValue={filters.maxValue}
                        onMinChange={(value) => handleChange("minValue", value)}
                        onMaxChange={(value) => handleChange("maxValue", value)}
                    />

                    <IssueDateRangeFilter
                        minDate={filters.minIssuedDate}
                        maxDate={filters.maxIssuedDate}
                        onMinChange={(value) => handleChange("minIssuedDate", value)}
                        onMaxChange={(value) => handleChange("maxIssuedDate", value)}
                    />
                </div>

                {/* Reset and Search Buttons */}
                <div className="flex gap-3 pt-2">
                    {hasActiveFilters && (
                        <button
                            onClick={handleReset}
                            className="text-sm text-gray-600 hover:text-gray-900 underline"
                        >
                            Reset all filters
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        onClick={onSearch}
                        className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                    >
                        Search
                    </button>
                </div>
            </div>

            {/* Active Filters Summary */}
            {hasActiveFilters && (
                <div className="px-4 py-2 bg-blue-50 border-t border-gray-200">
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-medium text-gray-700">
                            Active filters:
                        </span>
                        {filters.propertyTypes.length > 0 && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Property: {filters.propertyTypes.length} selected
                            </span>
                        )}
                        {filters.permitTypes.length > 0 && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Permit: {filters.permitTypes.length} selected
                            </span>
                        )}
                        {filters.cities.length > 0 && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                City: {filters.cities.length} selected ({filters.cities.map(getCityDisplayName).join(", ")})
                            </span>
                        )}
                        {filters.hasContractor !== null && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Contractor: {filters.hasContractor ? "Has" : "None"}
                            </span>
                        )}
                        {(filters.minValue || filters.maxValue) && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Value: ${filters.minValue || "0"} - ${filters.maxValue || "∞"}
                            </span>
                        )}
                        {(filters.minIssuedDate || filters.maxIssuedDate) && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Issue Date: {filters.minIssuedDate || "any"} - {filters.maxIssuedDate || "any"}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
