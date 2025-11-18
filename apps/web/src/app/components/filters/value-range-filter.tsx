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
            <div className="flex gap-1">
                <input
                    type="number"
                    placeholder="Min"
                    value={minValue}
                    onChange={(e) => onMinChange(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400"
                    min="0"
                />
                <span className="self-center text-gray-500 text-sm">-</span>
                <input
                    type="number"
                    placeholder="Max"
                    value={maxValue}
                    onChange={(e) => onMaxChange(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-gray-400"
                    min="0"
                />
            </div>
        </div>
    );
}

