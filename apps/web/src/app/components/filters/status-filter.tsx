"use client";

import { PermitStatus } from "@prisma/client";
import { formatEnumLabel } from "./utils";
import { MultiSelectFilter } from "./multi-select-filter";

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
    return (
        <MultiSelectFilter
            label="Status (select multiple)"
            options={PERMIT_STATUSES}
            selectedValues={selectedStatuses}
            onChange={onChange}
        />
    );
}

