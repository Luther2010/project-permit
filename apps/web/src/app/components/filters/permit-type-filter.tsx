"use client";

import { PermitType } from "@prisma/client";
import { formatEnumLabel } from "./utils";
import { MultiSelectFilter } from "./multi-select-filter";

// Generate permit types array from Prisma enum
const PERMIT_TYPES = (Object.values(PermitType) as PermitType[])
    .filter((value) => typeof value === "string")
    .map((value) => ({
        value,
        label: formatEnumLabel(value),
    }));

interface PermitTypeFilterProps {
    selectedTypes: PermitType[];
    onChange: (selectedTypes: PermitType[]) => void;
}

export function PermitTypeFilter({
    selectedTypes,
    onChange,
}: PermitTypeFilterProps) {
    return (
        <MultiSelectFilter
            label="Permit Type (select multiple)"
            options={PERMIT_TYPES}
            selectedValues={selectedTypes}
            onChange={onChange}
        />
    );
}

