"use client";

import { useMemo } from "react";
import { PropertyType } from "@prisma/client";
import { formatEnumLabel } from "./utils";

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

    const handleToggle = (value: PropertyType, checked: boolean) => {
        const newSelection = checked
            ? [...selectedTypes, value]
            : selectedTypes.filter((v) => v !== value);
        onChange(newSelection);
    };

    return (
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
                            checked={selectedTypes.includes(type.value)}
                            onChange={(e) =>
                                handleToggle(type.value, e.target.checked)
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
    );
}

