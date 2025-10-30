"use client";

interface HasContractorFilterProps {
    value: boolean | null; // null = Any
    onChange: (value: boolean | null) => void;
}

export function HasContractorFilter({ value, onChange }: HasContractorFilterProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Has Contractor
            </label>
            <select
                className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                value={value === null ? "any" : value ? "yes" : "no"}
                onChange={(e) => {
                    const v = e.target.value;
                    if (v === "any") onChange(null);
                    else if (v === "yes") onChange(true);
                    else onChange(false);
                }}
            >
                <option value="any">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
            </select>
        </div>
    );
}


