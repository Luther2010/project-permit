"use client";

import { getEnabledCities, getCityDisplayName } from "@/lib/cities";
import type { City } from "@prisma/client";

interface CitySelectorProps {
    selectedCities: City[];
    onCitiesChange: (cities: City[]) => void;
}

export function CitySelector({ selectedCities, onCitiesChange }: CitySelectorProps) {
    const enabledCities = getEnabledCities();

    const handleCityToggle = (city: City) => {
        if (selectedCities.includes(city)) {
            // Remove city if already selected (but keep at least one)
            if (selectedCities.length > 1) {
                onCitiesChange(selectedCities.filter((c) => c !== city));
            }
        } else {
            // Add city
            onCitiesChange([...selectedCities, city]);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Select Cities to Compare
            </h3>
            <div className="flex flex-wrap gap-3">
                {enabledCities.map((city) => {
                    const isSelected = selectedCities.includes(city);
                    return (
                        <button
                            key={city}
                            onClick={() => handleCityToggle(city)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                isSelected
                                    ? "bg-blue-600 text-white hover:bg-blue-700"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                        >
                            {getCityDisplayName(city)}
                        </button>
                    );
                })}
            </div>
            <p className="mt-4 text-sm text-gray-500">
                {selectedCities.length} city{selectedCities.length !== 1 ? "ies" : "y"} selected
            </p>
        </div>
    );
}

