"use client";

import { PermitStatus } from "@prisma/client";
import { formatEnumLabel } from "./utils";

// Generate status array from Prisma enum
const PERMIT_STATUSES = (Object.values(PermitStatus) as PermitStatus[])
    .filter((value) => typeof value === "string")
    .map((value) => ({
        value,
        label: formatEnumLabel(value),
    }));

interface StatusFilterProps {
    selectedStatuses: PermitStatus[];
    onChange: (selectedStatuses: PermitStatus[]) => void;
}

export function StatusFilter({
    selectedStatuses,
    onChange,
}: StatusFilterProps) {
    const handleToggle = (value: PermitStatus, checked: boolean) => {
        const newSelection = checked
            ? [...selectedStatuses, value]
            : selectedStatuses.filter((v) => v !== value);
        onChange(newSelection);
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
                Status (select multiple)
            </label>
            <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto bg-white">
                {PERMIT_STATUSES.map((status) => (
                    <label
                        key={status.value}
                        className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-2"
                    >
                        <input
                            type="checkbox"
                            checked={selectedStatuses.includes(status.value)}
                            onChange={(e) =>
                                handleToggle(status.value, e.target.checked)
                            }
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                            {status.label}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
}

