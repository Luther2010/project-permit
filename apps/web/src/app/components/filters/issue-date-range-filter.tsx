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
                Applied Date Range
            </label>
            <div className="flex gap-1">
                <input
                    type="date"
                    value={minDate}
                    onChange={(e) => onMinChange(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="self-center text-gray-500 text-sm">-</span>
                <input
                    type="date"
                    value={maxDate}
                    onChange={(e) => onMaxChange(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
            </div>
        </div>
    );
}

