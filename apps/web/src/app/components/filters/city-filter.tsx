"use client";

import { useMemo } from "react";
import { City } from "@prisma/client";
import { getEnabledCities, getCityDisplayName } from "@/lib/cities";
import { MultiSelectFilter } from "./multi-select-filter";

interface CityFilterProps {
    selectedCities: City[];
    onChange: (selectedCities: City[]) => void;
}

export function CityFilter({ selectedCities, onChange }: CityFilterProps) {
    // Sort cities to ensure consistent ordering between server and client
    // Use useMemo to ensure the same order on both server and client
    const enabledCities = useMemo(() => {
        return getEnabledCities()
            .sort()
            .map((city) => ({
                value: city,
                label: getCityDisplayName(city),
            }));
    }, []);

    return (
        <MultiSelectFilter
            label="City (select multiple)"
            options={enabledCities}
            selectedValues={selectedCities}
            onChange={onChange}
            showClearButton={true}
        />
    );
}
