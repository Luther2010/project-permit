"use client";

import { useMemo } from "react";
import { PropertyType } from "@prisma/client";
import { formatEnumLabel } from "./utils";
import { MultiSelectFilter } from "./multi-select-filter";

interface PropertyTypeFilterProps {
    selectedTypes: PropertyType[];
    onChange: (selectedTypes: PropertyType[]) => void;
}

export function PropertyTypeFilter({
    selectedTypes,
    onChange,
}: PropertyTypeFilterProps) {
    // Generate property types array from Prisma enum at render time
    // This ensures we use whatever the schema defines, computed consistently on client
    const PROPERTY_TYPES = useMemo(() => {
        return (Object.values(PropertyType) as PropertyType[])
            .filter((value) => typeof value === "string")
            .map((value) => ({
                value,
                label: formatEnumLabel(value),
            }));
    }, []);

    return (
        <MultiSelectFilter
            label="Property Type (select multiple)"
            options={PROPERTY_TYPES}
            selectedValues={selectedTypes}
            onChange={onChange}
        />
    );
}

