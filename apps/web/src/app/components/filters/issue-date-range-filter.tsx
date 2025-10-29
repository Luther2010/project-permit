"use client";

interface IssueDateRangeFilterProps {
    minDate: string;
    maxDate: string;
    onMinChange: (value: string) => void;
    onMaxChange: (value: string) => void;
}

export function IssueDateRangeFilter({
    minDate,
    maxDate,
    onMinChange,
    onMaxChange,
}: IssueDateRangeFilterProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Issue Date Range
            </label>
            <div className="flex gap-2">
                <input
                    type="date"
                    value={minDate}
                    onChange={(e) => onMinChange(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="self-center text-gray-500">-</span>
                <input
                    type="date"
                    value={maxDate}
                    onChange={(e) => onMaxChange(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
            </div>
        </div>
    );
}

