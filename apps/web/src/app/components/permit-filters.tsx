"use client";

import { PropertyTypeFilter } from "./filters/property-type-filter";
import { PermitTypeFilter } from "./filters/permit-type-filter";
import { StatusFilter } from "./filters/status-filter";
import { CityFilter } from "./filters/city-filter";
import { ValueRangeFilter } from "./filters/value-range-filter";
import { IssueDateRangeFilter } from "./filters/issue-date-range-filter";
import { HasContractorFilter } from "./filters/has-contractor-filter";
import type { PropertyType, PermitType, PermitStatus, City } from "@prisma/client";
import { getCityDisplayName } from "@/lib/cities";

export interface FilterState {
    propertyTypes: PropertyType[];
    permitTypes: PermitType[];
    statuses: PermitStatus[];
    cities: City[];
    hasContractor: boolean | null;
    minValue: string;
    maxValue: string;
    minAppliedDate: string;
    maxAppliedDate: string;
}

interface PermitFiltersProps {
    filters: FilterState;
    onFiltersChange: (filters: FilterState) => void;
    onSearch: () => void;
    onSortReset?: () => void;
}

export function PermitFilters({
    filters,
    onFiltersChange,
    onSearch,
    onSortReset,
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
            statuses: [],
            cities: [],
            hasContractor: null,
            minValue: "",
            maxValue: "",
            minAppliedDate: "",
            maxAppliedDate: "",
        };
        onFiltersChange(resetFilters);
        onSortReset?.();
    };

    const hasActiveFilters =
        filters.propertyTypes.length > 0 ||
        filters.permitTypes.length > 0 ||
        filters.statuses.length > 0 ||
        filters.cities.length > 0 ||
        (filters.hasContractor !== null) ||
        filters.minValue ||
        filters.maxValue ||
        filters.minAppliedDate ||
        filters.maxAppliedDate;

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
            {/* Filters Header */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">Filter Permits</h2>
            </div>

            {/* Filters - Scrollable area */}
            <div className="flex-1 overflow-y-auto">
                <div className="px-4 pt-4 pb-4 space-y-4">
                    <div className="space-y-4">
                        <CityFilter
                            selectedCities={filters.cities}
                            onChange={(cities) => handleChange("cities", cities)}
                        />

                        <StatusFilter
                            selectedStatuses={filters.statuses}
                            onChange={(statuses) => handleChange("statuses", statuses)}
                        />

                        <IssueDateRangeFilter
                            minDate={filters.minAppliedDate}
                            maxDate={filters.maxAppliedDate}
                            onMinChange={(value) => handleChange("minAppliedDate", value)}
                            onMaxChange={(value) => handleChange("maxAppliedDate", value)}
                        />

                        <ValueRangeFilter
                            minValue={filters.minValue}
                            maxValue={filters.maxValue}
                            onMinChange={(value) => handleChange("minValue", value)}
                            onMaxChange={(value) => handleChange("maxValue", value)}
                        />

                        <HasContractorFilter
                            value={filters.hasContractor}
                            onChange={(value) => handleChange("hasContractor", value)}
                        />

                        <PropertyTypeFilter
                            selectedTypes={filters.propertyTypes}
                            onChange={(types) => handleChange("propertyTypes", types)}
                        />

                        <PermitTypeFilter
                            selectedTypes={filters.permitTypes}
                            onChange={(types) => handleChange("permitTypes", types)}
                        />
                    </div>
                </div>
            </div>

            {/* Sticky Active Filters and Search/Reset Buttons */}
            <div className="flex-shrink-0 sticky bottom-0 bg-white border-t border-gray-200">
                {/* Active Filters Summary */}
                {hasActiveFilters && (
                    <div className="px-4 py-2 bg-blue-50 border-b border-gray-200">
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
                            {filters.statuses.length > 0 && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                    Status: {filters.statuses.length} selected
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
                            {(filters.minAppliedDate || filters.maxAppliedDate) && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                    Applied Date: {filters.minAppliedDate || "any"} - {filters.maxAppliedDate || "any"}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Search and Reset Buttons */}
                <div className="p-4">
                    <div className="space-y-2">
                        <button
                            onClick={onSearch}
                            className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                        >
                            Search
                        </button>
                        {hasActiveFilters && (
                            <button
                                onClick={handleReset}
                                className="w-full text-sm text-gray-600 hover:text-gray-900 underline"
                            >
                                Reset all filters
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
