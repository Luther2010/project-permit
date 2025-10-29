"use client";

interface ValueRangeFilterProps {
    minValue: string;
    maxValue: string;
    onMinChange: (value: string) => void;
    onMaxChange: (value: string) => void;
}

export function ValueRangeFilter({
    minValue,
    maxValue,
    onMinChange,
    onMaxChange,
}: ValueRangeFilterProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Value Range ($)
            </label>
            <div className="flex gap-2">
                <input
                    type="number"
                    placeholder="Min"
                    value={minValue}
                    onChange={(e) => onMinChange(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    min="0"
                />
                <span className="self-center text-gray-500">-</span>
                <input
                    type="number"
                    placeholder="Max"
                    value={maxValue}
                    onChange={(e) => onMaxChange(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    min="0"
                />
            </div>
        </div>
    );
}

