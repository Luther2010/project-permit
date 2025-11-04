"use client";

import { useMemo } from "react";
import { City } from "@prisma/client";
import { getEnabledCities, getCityDisplayName } from "@/lib/cities";

interface CityFilterProps {
    selectedCities: City[];
    onChange: (selectedCities: City[]) => void;
}

export function CityFilter({ selectedCities, onChange }: CityFilterProps) {
    // Sort cities to ensure consistent ordering between server and client
    // Use useMemo to ensure the same order on both server and client
    const enabledCities = useMemo(() => getEnabledCities().sort(), []);

    const handleToggle = (value: City, checked: boolean) => {
        const newSelection = checked
            ? [...selectedCities, value]
            : selectedCities.filter((v) => v !== value);
        onChange(newSelection);
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                City (select multiple)
            </label>
            <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto bg-white">
                {enabledCities.map((city) => (
                    <label
                        key={city}
                        className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-2"
                    >
                        <input
                            type="checkbox"
                            checked={selectedCities.includes(city)}
                            onChange={(e) =>
                                handleToggle(city, e.target.checked)
                            }
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                            {getCityDisplayName(city)}
                        </span>
                    </label>
                ))}
            </div>
            {selectedCities.length > 0 && (
                <button
                    type="button"
                    onClick={() => onChange([])}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                >
                    Clear selection
                </button>
            )}
        </div>
    );
}
