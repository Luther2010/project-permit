"use client";

import { PermitType } from "@prisma/client";
import { formatEnumLabel } from "./utils";

// Generate permit types array from Prisma enum
const PERMIT_TYPES = (Object.values(PermitType) as string[])
    .filter((value) => typeof value === "string")
    .map((value) => ({
        value,
        label: formatEnumLabel(value),
    }));

interface PermitTypeFilterProps {
    selectedTypes: string[];
    onChange: (selectedTypes: string[]) => void;
}

export function PermitTypeFilter({
    selectedTypes,
    onChange,
}: PermitTypeFilterProps) {
    const handleToggle = (value: string, checked: boolean) => {
        const newSelection = checked
            ? [...selectedTypes, value]
            : selectedTypes.filter((v) => v !== value);
        onChange(newSelection);
    };

    return (
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

