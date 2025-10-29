"use client";

import { useState } from "react";
import { PropertyType, PermitType } from "@prisma/client";

export interface FilterState {
    query: string;
    propertyTypes: string[];
    permitTypes: string[];
    city: string;
    minValue: string;
    maxValue: string;
}

interface PermitFiltersProps {
    filters: FilterState;
    onFiltersChange: (filters: FilterState) => void;
    onSearch: () => void;
}

/**
 * Formats an enum value to a display label.
 * Converts "RESIDENTIAL" -> "Residential", "POOL_AND_HOT_TUB" -> "Pool and Hot Tub"
 */
function formatEnumLabel(value: string): string {
    return value
        .split("_")
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ");
}

// Generate property types array from Prisma enum
// Filter to ensure we only get string values (TypeScript enums include numeric reverse mappings)
const PROPERTY_TYPES = (Object.values(PropertyType) as string[])
    .filter((value) => typeof value === "string")
    .map((value) => ({
        value,
        label: formatEnumLabel(value),
    }));

// Generate permit types array from Prisma enum
const PERMIT_TYPES = (Object.values(PermitType) as string[])
    .filter((value) => typeof value === "string")
    .map((value) => ({
        value,
        label: formatEnumLabel(value),
    }));

export function PermitFilters({
    filters,
    onFiltersChange,
    onSearch,
}: PermitFiltersProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleChange = (field: keyof FilterState, value: string | string[]) => {
        onFiltersChange({
            ...filters,
            [field]: value,
        });
    };

    const handleMultiSelectChange = (
        field: "propertyTypes" | "permitTypes",
        value: string,
        checked: boolean
    ) => {
        const currentValues = filters[field] || [];
        const newValues = checked
            ? [...currentValues, value]
            : currentValues.filter((v) => v !== value);
        handleChange(field, newValues);
    };

    const handleReset = () => {
        const resetFilters: FilterState = {
            query: "",
            propertyTypes: [],
            permitTypes: [],
            city: "",
            minValue: "",
            maxValue: "",
        };
        onFiltersChange(resetFilters);
    };

    const handleSearch = () => {
        onSearch();
    };

    const hasActiveFilters =
        filters.query ||
        filters.propertyTypes.length > 0 ||
        filters.permitTypes.length > 0 ||
        filters.city ||
        filters.minValue ||
        filters.maxValue;

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            {/* Search Bar with Search Button */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label
                            htmlFor="search"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Search
                        </label>
                        <input
                            id="search"
                            type="text"
                            placeholder="Search by permit number, title, description, address, or city..."
                            value={filters.query}
                            onChange={(e) => handleChange("query", e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSearch();
                                }
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={handleSearch}
                            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                        >
                            Search
                        </button>
                    </div>
                </div>
            </div>

            {/* Advanced Filters - Collapsible */}
            <div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <span>Advanced Filters</span>
                    <svg
                        className={`w-5 h-5 transition-transform ${
                            isExpanded ? "transform rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>

                {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-200 pt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Property Type Multi-Select */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Property Type (select multiple)
                                </label>
                                <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto bg-white">
                                    {PROPERTY_TYPES.map((type) => (
                                        <label
                                            key={type.value}
                                            className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-2"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.propertyTypes.includes(
                                                    type.value
                                                )}
                                                onChange={(e) =>
                                                    handleMultiSelectChange(
                                                        "propertyTypes",
                                                        type.value,
                                                        e.target.checked
                                                    )
                                                }
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">
                                                {type.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Permit Type Multi-Select */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Permit Type (select multiple)
                                </label>
                                <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto bg-white">
                                    {PERMIT_TYPES.map((type) => (
                                        <label
                                            key={type.value}
                                            className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-2"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={filters.permitTypes.includes(
                                                    type.value
                                                )}
                                                onChange={(e) =>
                                                    handleMultiSelectChange(
                                                        "permitTypes",
                                                        type.value,
                                                        e.target.checked
                                                    )
                                                }
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">
                                                {type.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* City */}
                            <div>
                                <label
                                    htmlFor="city"
                                    className="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    City
                                </label>
                                <input
                                    id="city"
                                    type="text"
                                    placeholder="Filter by city..."
                                    value={filters.city}
                                    onChange={(e) => handleChange("city", e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>

                            {/* Value Range */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Value Range ($)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        placeholder="Min"
                                        value={filters.minValue}
                                        onChange={(e) =>
                                            handleChange("minValue", e.target.value)
                                        }
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        min="0"
                                    />
                                    <span className="self-center text-gray-500">-</span>
                                    <input
                                        type="number"
                                        placeholder="Max"
                                        value={filters.maxValue}
                                        onChange={(e) =>
                                            handleChange("maxValue", e.target.value)
                                        }
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        min="0"
                                    />
                                </div>
                            </div>
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
                                onClick={handleSearch}
                                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
                            >
                                Search
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Active Filters Summary */}
            {hasActiveFilters && (
                <div className="px-4 py-2 bg-blue-50 border-t border-gray-200">
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-medium text-gray-700">
                            Active filters:
                        </span>
                        {filters.query && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Search: &quot;{filters.query}&quot;
                            </span>
                        )}
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
                        {filters.city && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                City: {filters.city}
                            </span>
                        )}
                        {(filters.minValue || filters.maxValue) && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                Value: ${filters.minValue || "0"} - ${filters.maxValue || "∞"}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
