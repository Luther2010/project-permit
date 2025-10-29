"use client";

interface CityFilterProps {
    value: string;
    onChange: (value: string) => void;
}

export function CityFilter({ value, onChange }: CityFilterProps) {
    return (
        <div>
            <label
                htmlFor="city"
                className="block text-sm font-medium text-gray-700 mb-1"
            >
                City
            </label>
            <input
                id="city"
                type="text"
                placeholder="Filter by city..."
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
        </div>
    );
}

